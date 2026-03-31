const DISTANCE_ORDER = ["3km", "5km", "10km", "21km"];
const STORAGE_KEY = "kit-withdrawal-entries";
const LEGACY_STORAGE_KEYS = ["kit-withdrawal-entries", "kitWithdrawalEntries"];
const DB_NAME = "kit-withdrawal-db";
const STORE_NAME = "entries";
const GOOGLE_SHEETS_ONLY_MODE = true;

// Para persistencia real entre acessos e aparelhos, publique o Apps Script e cole a URL abaixo.
const GOOGLE_SCRIPT_URL = "";

const form = document.getElementById("kit-form");
const fullNameInput = document.getElementById("fullName");
const distanceInput = document.getElementById("distance");
const shirtSizeInput = document.getElementById("shirtSize");
const messageElement = document.getElementById("form-message");
const groupsContainer = document.getElementById("distance-groups");
const shirtSummaryElement = document.getElementById("shirt-summary");
const tableBody = document.getElementById("entries-table-body");
const totalCountElement = document.getElementById("total-count");
const exportButton = document.getElementById("export-button");

let entries = [];

render();
initializeApp();

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

  if (shouldUseGoogleSheetsAsSingleSource()) {
    const syncStatus = await syncWithGoogleSheets(newEntry);

    if (syncStatus === "synced" || syncStatus === "queued") {
      entries = sortEntries(await loadEntriesFromGoogleSheets());
      await clearBrowserEntries();
      render();
      form.reset();
      fullNameInput.focus();
      showMessage(getSubmitMessage(syncStatus));
      return;
    }

    showMessage("Nao foi possivel salvar no Google Sheets. Confira a URL do Apps Script publicado.", true);
    return;
  }

  entries = sortEntries([...entries, newEntry]);
  await persistEntries(entries);
  render();
  form.reset();
  fullNameInput.focus();

  const syncStatus = await syncWithGoogleSheets(newEntry);
  showMessage(getSubmitMessage(syncStatus));
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

async function initializeApp() {
  showMessage("Carregando cadastros salvos...");

  if (shouldUseGoogleSheetsAsSingleSource()) {
    await clearBrowserEntries();
    entries = sortEntries(await loadEntriesFromGoogleSheets());
    render();
    showMessage(
      entries.length
        ? "Cadastros carregados do Google Sheets."
        : "Sistema pronto. Os dados exibidos virao somente do Google Sheets."
    );
    return;
  }

  const localEntries = loadEntriesFromLocalStorage();
  const indexedDbEntries = await loadEntriesFromIndexedDB();
  let mergedEntries = mergeEntries(localEntries, indexedDbEntries);

  if (isGoogleScriptConfigured()) {
    const remoteEntries = await loadEntriesFromGoogleSheets();
    mergedEntries = mergeEntries(mergedEntries, remoteEntries);
  }

  entries = sortEntries(mergedEntries);
  await persistEntries(entries);
  render();

  if (entries.length) {
    showMessage(
      isGoogleScriptConfigured()
        ? "Cadastros carregados com sucesso."
        : getLocalStorageHint()
    );
    return;
  }

  showMessage(
    isGoogleScriptConfigured()
      ? "Sistema pronto para receber cadastros."
      : getLocalStorageHint()
  );
}

function getSubmitMessage(syncStatus) {
  if (syncStatus === "synced") {
    return "Cadastro salvo e enviado para o Google Sheets.";
  }

  if (syncStatus === "queued") {
    return "Cadastro salvo no navegador. O envio para o Google Sheets foi feito em modo simples.";
  }

  if (looksLikeSpreadsheetUrl(GOOGLE_SCRIPT_URL)) {
    return "A URL informada e da planilha, nao do Apps Script publicado. Use o link do tipo script.google.com/macros/s/.../exec.";
  }

  if (isGoogleScriptConfigured()) {
    return "Cadastro salvo no navegador. Confira a URL do Google Sheets para manter tudo sincronizado.";
  }

  return getLocalStorageHint("Cadastro salvo no navegador.");
}

function getLocalStorageHint(prefix) {
  const baseMessage = window.location.protocol === "file:"
    ? "Para nao perder os dados ao reabrir em outros acessos, conecte o Google Sheets."
    : "Os cadastros estao guardados neste navegador.";

  return prefix ? `${prefix} ${baseMessage}` : baseMessage;
}

function loadEntriesFromLocalStorage() {
  try {
    const rawEntries = localStorage.getItem(STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeEntry) : [];
  } catch (error) {
    console.error("Erro ao carregar dados do localStorage:", error);
    return [];
  }
}

function saveEntriesToLocalStorage(nextEntries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
}

async function loadEntriesFromIndexedDB() {
  if (!window.indexedDB) {
    return [];
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return [];
    }

    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result || []).map(normalizeEntry));
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Erro ao carregar dados do IndexedDB:", error);
    return [];
  }
}

async function saveEntriesToIndexedDB(nextEntries) {
  if (!window.indexedDB) {
    return;
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      store.clear();
      nextEntries.forEach((entry) => {
        store.put(normalizeEntry(entry));
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("Erro ao salvar dados no IndexedDB:", error);
  }
}

async function persistEntries(nextEntries) {
  const normalizedEntries = sortEntries(nextEntries.map(normalizeEntry));
  saveEntriesToLocalStorage(normalizedEntries);
  await saveEntriesToIndexedDB(normalizedEntries);
}

async function clearBrowserEntries() {
  clearWebStorage();
  await deleteIndexedDBDatabase();
  await clearIndexedDBEntries();
}

async function openDatabase() {
  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearIndexedDBEntries() {
  if (!window.indexedDB) {
    return;
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Erro ao limpar IndexedDB:", error);
  }
}

function clearWebStorage() {
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Erro ao limpar localStorage (${key}):`, error);
    }

    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.error(`Erro ao limpar sessionStorage (${key}):`, error);
    }
  });
}

async function deleteIndexedDBDatabase() {
  if (!window.indexedDB) {
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  } catch (error) {
    console.error("Erro ao excluir o banco IndexedDB:", error);
  }
}

async function loadEntriesFromGoogleSheets() {
  if (!isGoogleScriptConfigured()) {
    return [];
  }

  try {
    const separator = GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${GOOGLE_SCRIPT_URL}${separator}action=list&ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.entries) ? data.entries.map(normalizeEntry) : [];
  } catch (error) {
    console.error("Erro ao carregar dados do Google Sheets:", error);
    return [];
  }
}

async function syncWithGoogleSheets(entry) {
  if (!isGoogleScriptConfigured()) {
    return "disabled";
  }

  const payload = JSON.stringify(normalizeEntry(entry));

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    if (response.ok) {
      return "synced";
    }
  } catch (error) {
    console.error("Erro ao enviar para o Google Sheets:", error);
  }

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    return "queued";
  } catch (error) {
    console.error("Erro no envio simples para o Google Sheets:", error);
    return "local_only";
  }
}

function mergeEntries(...lists) {
  const mergedMap = new Map();

  lists
    .flat()
    .filter(Boolean)
    .map(normalizeEntry)
    .forEach((entry) => {
      const key = entry.id || createEntryFingerprint(entry);
      mergedMap.set(key, entry);
    });

  return [...mergedMap.values()];
}

function normalizeEntry(entry) {
  const normalizedEntry = {
    id: entry && entry.id ? String(entry.id) : "",
    fullName: entry && entry.fullName ? String(entry.fullName).trim().replace(/\s+/g, " ") : "",
    distance: entry && entry.distance ? String(entry.distance).trim() : "",
    shirtSize: entry && entry.shirtSize ? String(entry.shirtSize).trim() : "",
    createdAt: entry && entry.createdAt ? String(entry.createdAt) : new Date().toISOString()
  };

  if (!normalizedEntry.id) {
    normalizedEntry.id = createEntryFingerprint(normalizedEntry);
  }

  return normalizedEntry;
}

function createEntryFingerprint(entry) {
  return [
    entry.fullName || "",
    entry.distance || "",
    entry.shirtSize || "",
    entry.createdAt || ""
  ].join("|");
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

function getShirtSummary(list) {
  const shirtOrder = ["PP", "P", "M", "G", "GG"];

  return shirtOrder.map((size) => ({
    size,
    count: list.filter((entry) => entry.shirtSize === size).length
  }));
}

function render() {
  const sortedEntries = sortEntries(entries);
  const groupedEntries = groupEntriesByDistance(sortedEntries);
  const shirtSummary = getShirtSummary(sortedEntries);

  totalCountElement.textContent = `${sortedEntries.length} inscrito${sortedEntries.length === 1 ? "" : "s"}`;
  shirtSummaryElement.innerHTML = shirtSummary
    .map((item) => `<span class="shirt-summary-item">${item.size}: ${item.count}</span>`)
    .join("");

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
              <span class="athlete-line">${escapeHtml(entry.fullName)} - ${escapeHtml(entry.shirtSize)}</span>
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

function createEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isGoogleScriptConfigured() {
  return Boolean(GOOGLE_SCRIPT_URL) && !looksLikeSpreadsheetUrl(GOOGLE_SCRIPT_URL);
}

function looksLikeSpreadsheetUrl(url) {
  return /docs\.google\.com\/spreadsheets/i.test(String(url || ""));
}

function shouldUseGoogleSheetsAsSingleSource() {
  return GOOGLE_SHEETS_ONLY_MODE && isGoogleScriptConfigured();
}
