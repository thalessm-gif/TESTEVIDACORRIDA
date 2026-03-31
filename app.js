const DISTANCE_ORDER = ["3km", "5km", "10km", "21km"];
const STORAGE_KEY = "kit-withdrawal-entries";

// Se quiser enviar automaticamente para Google Sheets, cole aqui a URL do Apps Script publicado.
const GOOGLE_SCRIPT_URL = "";

const form = document.getElementById("kit-form");
const fullNameInput = document.getElementById("fullName");
const distanceInput = document.getElementById("distance");
const shirtSizeInput = document.getElementById("shirtSize");
const messageElement = document.getElementById("form-message");
const groupsContainer = document.getElementById("distance-groups");
const tableBody = document.getElementById("entries-table-body");
const totalCountElement = document.getElementById("total-count");
const exportButton = document.getElementById("export-button");

let entries = loadEntries();

render();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fullName = fullNameInput.value.trim().replace(/\s+/g, " ");
  const distance = distanceInput.value;
  const shirtSize = shirtSizeInput.value;

  if (!fullName || !distance || !shirtSize) {
    showMessage("Preencha todos os campos antes de enviar.", true);
    return;
  }

  const newEntry = {
    id: createEntryId(),
    fullName,
    distance,
    shirtSize,
    createdAt: new Date().toISOString()
  };

  entries.push(newEntry);
  entries = sortEntries(entries);
  saveEntries(entries);
  render();
  form.reset();
  fullNameInput.focus();

  const synced = await syncWithGoogleSheets(newEntry);
  showMessage(
    synced
      ? "Cadastro salvo e enviado para o Google Sheets."
      : GOOGLE_SCRIPT_URL
        ? "Cadastro salvo localmente. Nao foi possivel confirmar o envio para o Google Sheets."
        : "Cadastro salvo com sucesso."
  );
});

exportButton.addEventListener("click", () => {
  if (!entries.length) {
    showMessage("Ainda nao ha cadastros para exportar.", true);
    return;
  }

  const csvLines = [
    ["Nome completo", "Distancia", "Tamanho da camisa"],
    ...sortEntries([...entries]).map((entry) => [entry.fullName, entry.distance, entry.shirtSize])
  ];

  const csvContent = csvLines
    .map((line) => line.map(escapeCsvValue).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);

  link.href = downloadUrl;
  link.download = `retirada-kits-${today}.csv`;
  link.click();

  URL.revokeObjectURL(downloadUrl);
  showMessage("Arquivo CSV exportado com sucesso.");
});

function loadEntries() {
  try {
    const rawEntries = localStorage.getItem(STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? sortEntries(parsedEntries) : [];
  } catch (error) {
    console.error("Erro ao carregar dados locais:", error);
    return [];
  }
}

function saveEntries(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

function sortEntries(list) {
  return [...list].sort((first, second) => {
    const distanceDiff = DISTANCE_ORDER.indexOf(first.distance) - DISTANCE_ORDER.indexOf(second.distance);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }

    return first.fullName.localeCompare(second.fullName, "pt-BR", { sensitivity: "base" });
  });
}

function groupEntriesByDistance(list) {
  return DISTANCE_ORDER.map((distance) => ({
    distance,
    items: list
      .filter((entry) => entry.distance === distance)
      .sort((first, second) =>
        first.fullName.localeCompare(second.fullName, "pt-BR", { sensitivity: "base" })
      )
  }));
}

function render() {
  const sortedEntries = sortEntries(entries);
  const groupedEntries = groupEntriesByDistance(sortedEntries);

  totalCountElement.textContent = `${sortedEntries.length} inscrito${sortedEntries.length === 1 ? "" : "s"}`;

  groupsContainer.innerHTML = groupedEntries
    .map((group) => {
      if (!group.items.length) {
        return `
          <article class="distance-card">
            <h3>${group.distance}</h3>
            <p class="distance-count">0 atletas</p>
            <p class="empty-state">Nenhum nome cadastrado nessa distancia ainda.</p>
          </article>
        `;
      }

      const namesHtml = group.items
        .map(
          (entry) => `
            <li>
              <span class="athlete-name">${escapeHtml(entry.fullName)}</span>
              <span class="shirt-tag">Camiseta ${escapeHtml(entry.shirtSize)}</span>
            </li>
          `
        )
        .join("");

      return `
        <article class="distance-card">
          <h3>${group.distance}</h3>
          <p class="distance-count">${group.items.length} atleta${group.items.length === 1 ? "" : "s"}</p>
          <ul class="names-list">${namesHtml}</ul>
        </article>
      `;
    })
    .join("");

  tableBody.innerHTML = sortedEntries.length
    ? sortedEntries
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.fullName)}</td>
              <td>${escapeHtml(entry.distance)}</td>
              <td>${escapeHtml(entry.shirtSize)}</td>
            </tr>
          `
        )
        .join("")
    : `
        <tr>
          <td colspan="3">Nenhum cadastro enviado ainda.</td>
        </tr>
      `;
}

function showMessage(text, isError = false) {
  messageElement.textContent = text;
  messageElement.style.color = isError ? "#9f2d2d" : "#14483e";
}

function escapeCsvValue(value) {
  const safeValue = String(value ?? "");
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function syncWithGoogleSheets(entry) {
  if (!GOOGLE_SCRIPT_URL) {
    return false;
  }

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(entry)
    });

    return true;
  } catch (error) {
    console.error("Erro ao enviar para o Google Sheets:", error);
    return false;
  }
}

function createEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
