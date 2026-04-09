// Cole aqui o link da sua planilha do Google Sheets ou o link de exportacao CSV.
const HIGHLIGHTS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1totTCrCymqU5gpsuYMrRgYoHOCSfrVIP3B8xNy2JKlw/edit?usp=sharing";

const athletesCountElement = document.getElementById("athletes-count");
const weeksCountElement = document.getElementById("weeks-count");
const perfectCountElement = document.getElementById("perfect-count");
const sheetStatusElement = document.getElementById("sheet-status");
const perfectListElement = document.getElementById("perfect-list");
const tableBodyElement = document.getElementById("highlights-table-body");
const searchInputElement = document.getElementById("highlights-search");
const avatarPreviewModalElement = document.getElementById("avatar-preview-modal");
const avatarPreviewImageElement = document.getElementById("avatar-preview-image");
const avatarPreviewNameElement = document.getElementById("avatar-preview-name");
const avatarPreviewCloseButtonElement = avatarPreviewModalElement.querySelector(".avatar-preview-close");

let highlightEntries = [];
let lastAvatarTriggerElement = null;

initializeHighlightsPage();

function initializeHighlightsPage() {
  searchInputElement.addEventListener("input", () => {
    renderHighlightsTable(filterEntries(searchInputElement.value));
  });

  perfectListElement.addEventListener("click", handleHighlightsClick);
  tableBodyElement.addEventListener("click", handleHighlightsClick);

  avatarPreviewModalElement.addEventListener("click", (event) => {
    if (event.target.closest("[data-avatar-close]")) {
      closeAvatarPreview();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !avatarPreviewModalElement.classList.contains("avatar-preview-modal-hidden")) {
      closeAvatarPreview();
    }
  });

  loadHighlightsFromSheet();
}

async function loadHighlightsFromSheet() {
  if (!HIGHLIGHTS_SHEET_URL) {
    setSheetStatus("Cole o link da planilha");
    renderSummary({ athleteCount: 0, weekCount: 0, perfectCount: 0 });
    renderPerfectMessage(
      "Assim que voce conectar a planilha, esta area vai mostrar quem esteve em destaque em todas as semanas."
    );
    renderErrorState("Conecte a planilha em highlights.js para visualizar os dados.");
    return;
  }

  try {
    setSheetStatus("Carregando informações...");
    const csvUrl = buildCsvUrl(HIGHLIGHTS_SHEET_URL);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    const parsedSheet = parseHighlightsCsv(csvContent);

    highlightEntries = parsedSheet.entries;
    renderSummary({
      athleteCount: parsedSheet.entries.length,
      weekCount: parsedSheet.weekColumns.length,
      perfectCount: parsedSheet.entries.filter((entry) => entry.isPerfect).length
    });
    renderPerfectList(parsedSheet.entries.filter((entry) => entry.isPerfect));
    renderHighlightsTable(filterEntries(searchInputElement.value));
    setSheetStatus("Informações Atualizadas");
  } catch (error) {
    console.error("Erro ao carregar destaques semanais:", error);
    highlightEntries = [];
    setSheetStatus("Erro ao carregar");
    renderSummary({ athleteCount: 0, weekCount: 0, perfectCount: 0 });
    renderPerfectMessage(
      "Nao foi possivel confirmar os atletas 100% ativos porque a leitura da planilha falhou."
    );
    renderErrorState(
      "Nao foi possivel carregar a planilha. Verifique o link em highlights.js e confirme se a planilha esta acessivel."
    );
  }
}

function buildCsvUrl(sheetUrl) {
  const safeUrl = String(sheetUrl || "").trim();

  if (!safeUrl) {
    return "";
  }

  if (/export\?format=csv/i.test(safeUrl) || /tqx=out:csv/i.test(safeUrl)) {
    return safeUrl;
  }

  const match = safeUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (!match) {
    return safeUrl;
  }

  const sheetId = match[1];
  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

function parseHighlightsCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (rows.length < 2) {
    return { entries: [], weekColumns: [] };
  }

  const headers = rows[0].map((header, index) => ({
    index,
    label: String(header || "").trim(),
    normalized: normalizeHeader(header)
  }));

  const athleteIdColumn = findHeader(headers, ["id atleta", "id_atleta", "codigo atleta", "codigo_atleta", "matricula atleta"]);
  const athleteEmailColumn = findHeader(headers, ["email atleta", "email", "e-mail"]);
  const nameColumn = headers.find((header) =>
    ["nome", "atleta", "atletas"].includes(header.normalized)
  );
  const avatarColumn = findHeader(headers, ["avatar", "foto", "imagem", "foto perfil", "foto_perfil"]);
  const totalColumn = headers.find((header) => header.normalized === "total");
  const explicitWeekColumns = headers.filter((header) => /^semana/.test(header.normalized));
  const fallbackWeekColumns = headers.filter(
    (header) =>
      header !== athleteIdColumn &&
      header !== athleteEmailColumn &&
      header !== nameColumn &&
      header !== avatarColumn &&
      header !== totalColumn
  );
  const weekColumns = explicitWeekColumns.length ? explicitWeekColumns : fallbackWeekColumns;

  if (!nameColumn) {
    throw new Error("Coluna de nome nao encontrada.");
  }

  const entries = rows
    .slice(1)
    .map((row) =>
      createHighlightEntry(row, {
        athleteIdColumn,
        athleteEmailColumn,
        nameColumn,
        avatarColumn,
        totalColumn,
        weekColumns
      })
    )
    .filter((entry) => entry.name)
    .sort(sortHighlightEntries);

  return { entries, weekColumns };
}

function createHighlightEntry(row, columns) {
  const athleteId = getCellValue(row, columns.athleteIdColumn ? columns.athleteIdColumn.index : -1);
  const athleteEmail = getCellValue(row, columns.athleteEmailColumn ? columns.athleteEmailColumn.index : -1);
  const name = getCellValue(row, columns.nameColumn.index);
  const rawAvatar = getCellValue(row, columns.avatarColumn ? columns.avatarColumn.index : -1);
  const avatar = resolveAvatarValue(rawAvatar, {
    athleteId,
    athleteEmail,
    athleteName: name
  });
  const weekColumns = columns.weekColumns;
  const activeWeeks = weekColumns
    .filter((column) => isActiveValue(getCellValue(row, column.index)))
    .map((column) => column.label);
  const activeWeekShortLabels = activeWeeks.map(getWeekShortLabel);
  const computedTotal = activeWeeks.length;
  const totalFromSheet = parsePositiveNumber(getCellValue(row, columns.totalColumn ? columns.totalColumn.index : -1));
  const total = totalFromSheet || computedTotal;
  const isPerfect = weekColumns.length > 0 && activeWeeks.length === weekColumns.length;

  return {
    athleteId,
    athleteEmail,
    name,
    avatar,
    activeWeeks,
    activeWeekShortLabels,
    total,
    isPerfect
  };
}

function renderSummary({ athleteCount, weekCount, perfectCount }) {
  athletesCountElement.textContent = String(athleteCount);
  weeksCountElement.textContent = String(weekCount);
  perfectCountElement.textContent = String(perfectCount);
}

function renderPerfectList(entries) {
  if (!entries.length) {
    renderPerfectMessage(
      "Nenhum atleta 100% ativo encontrado."
    );
    return;
  }

  perfectListElement.innerHTML = entries
    .map(
      (entry) => `
        <article class="perfect-athlete-card">
          ${renderHighlightAthleteAvatar(entry)}
          <p class="perfect-athlete-name">${escapeHtml(entry.name)}</p>
        </article>
      `
    )
    .join("");
}

function renderPerfectMessage(message) {
  perfectListElement.innerHTML = `
    <p class="empty-state">
      ${escapeHtml(message)}
    </p>
  `;
}

function renderHighlightsTable(entries) {
  if (!entries.length) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="4">Nenhum atleta encontrado para o filtro atual.</td>
      </tr>
    `;
    return;
  }

  tableBodyElement.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${renderHighlightAthleteIdentity(entry)}</td>
          <td>
            ${entry.activeWeekShortLabels.length
              ? `
                <div class="week-chip-list week-chip-list-compact">
                  ${entry.activeWeekShortLabels
                    .map((week) => `<span class="week-chip">${escapeHtml(week)}</span>`)
                    .join("")}
                </div>
              `
              : "-"}
          </td>
          <td>${entry.total}</td>
          <td>
            <span class="table-status ${entry.isPerfect ? "table-status-perfect" : ""}">
              ${entry.isPerfect ? "100% ativo" : "Parcial"}
            </span>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderErrorState(message) {
  tableBodyElement.innerHTML = `
    <tr>
      <td colspan="4">${escapeHtml(message)}</td>
    </tr>
  `;
}

function handleHighlightsClick(event) {
  const avatarButton = event.target.closest("[data-avatar-preview]");
  if (!avatarButton) {
    return;
  }

  openAvatarPreview(avatarButton);
}

function filterEntries(searchTerm) {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  if (!normalizedSearch) {
    return highlightEntries;
  }

  return highlightEntries.filter((entry) =>
    entry.name.toLowerCase().includes(normalizedSearch)
  );
}

function sortHighlightEntries(first, second) {
  if (second.isPerfect !== first.isPerfect) {
    return Number(second.isPerfect) - Number(first.isPerfect);
  }

  if (second.total !== first.total) {
    return second.total - first.total;
  }

  return first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" });
}

function setSheetStatus(text) {
  sheetStatusElement.textContent = text;
}

function getCellValue(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function parsePositiveNumber(value) {
  const numericValue = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function isActiveValue(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "x" || normalizedValue === "sim";
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function findHeader(headers, aliases) {
  return headers.find((header) =>
    aliases.some((alias) => header.normalized === alias || header.normalized.includes(alias))
  );
}

function getWeekShortLabel(value) {
  const label = String(value || "").trim();
  const numberMatch = label.match(/\d+/);
  return numberMatch ? numberMatch[0] : label;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length || currentRow.length) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

function renderHighlightAthleteIdentity(entry) {
  return `
    <div class="ranking-athlete-identity">
      ${renderHighlightAthleteAvatar(entry)}
      <div class="ranking-athlete-identity-copy">
        <span class="ranking-athlete-name-inline">${escapeHtml(entry.name)}</span>
      </div>
    </div>
  `;
}

function renderHighlightAthleteAvatar(entry) {
  const athleteInitials = escapeHtml(getAthleteInitials(entry.name));
  const avatarImage = entry.avatar
    ? `<img src="${escapeHtmlAttribute(entry.avatar)}" alt="" class="athlete-avatar-image" loading="lazy" decoding="async" onerror="this.remove()">`
    : "";

  if (entry.avatar) {
    return `
      <button
        type="button"
        class="athlete-avatar athlete-avatar-table athlete-avatar-button"
        data-avatar-preview="${escapeHtmlAttribute(entry.avatar)}"
        data-avatar-name="${escapeHtmlAttribute(entry.name)}"
        title="${escapeHtmlAttribute(entry.name)}"
        aria-label="Ampliar foto de ${escapeHtmlAttribute(entry.name)}"
      >
        <span class="athlete-avatar-fallback">${athleteInitials}</span>
        ${avatarImage}
      </button>
    `;
  }

  return `
    <span class="athlete-avatar athlete-avatar-table" aria-hidden="true">
      <span class="athlete-avatar-fallback">${athleteInitials}</span>
      ${avatarImage}
    </span>
  `;
}

function openAvatarPreview(triggerElement) {
  const avatarSource = String(triggerElement.dataset.avatarPreview || "").trim();
  const athleteName = String(triggerElement.dataset.avatarName || "").trim();

  if (!avatarSource) {
    return;
  }

  lastAvatarTriggerElement = triggerElement;
  avatarPreviewImageElement.src = avatarSource;
  avatarPreviewImageElement.alt = athleteName ? `Foto de ${athleteName}` : "Foto do atleta";
  avatarPreviewNameElement.textContent = athleteName || "Atleta";
  avatarPreviewModalElement.classList.remove("avatar-preview-modal-hidden");
  avatarPreviewModalElement.setAttribute("aria-hidden", "false");
  document.body.classList.add("avatar-preview-open");
  avatarPreviewCloseButtonElement.focus();
}

function closeAvatarPreview() {
  avatarPreviewModalElement.classList.add("avatar-preview-modal-hidden");
  avatarPreviewModalElement.setAttribute("aria-hidden", "true");
  avatarPreviewImageElement.removeAttribute("src");
  avatarPreviewImageElement.alt = "";
  avatarPreviewNameElement.textContent = "";
  document.body.classList.remove("avatar-preview-open");

  if (lastAvatarTriggerElement) {
    lastAvatarTriggerElement.focus();
    lastAvatarTriggerElement = null;
  }
}

function getAthleteInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function normalizeAvatarValue(value) {
  const safeValue = String(value || "").trim().replace(/\\/g, "/");

  if (!safeValue) {
    return "";
  }

  if (/^(?:(?:https?|file):)?\/\//i.test(safeValue) || /^data:/i.test(safeValue) || safeValue.startsWith("/")) {
    return safeValue;
  }

  if (/^(?:\.{1,2}\/)?assets\//i.test(safeValue) || safeValue.startsWith("./") || safeValue.startsWith("../")) {
    return safeValue;
  }

  return `assets/avatars/${safeValue}`;
}

function resolveAvatarValue(value, { athleteId = "", athleteEmail = "", athleteName = "" } = {}) {
  const mappedAvatar = getMappedAvatarValue({ athleteId, athleteEmail, athleteName });
  if (mappedAvatar) {
    return normalizeAvatarValue(mappedAvatar);
  }

  return normalizeAvatarValue(value);
}

function getMappedAvatarValue({ athleteId = "", athleteEmail = "", athleteName = "" } = {}) {
  if (typeof window.getVidaCorridaMappedAvatar !== "function") {
    return "";
  }

  return window.getVidaCorridaMappedAvatar({
    athleteId,
    athleteEmail,
    athleteName
  });
}
