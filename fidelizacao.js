const FIDELITY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1ms5k9CZZhfSKQGxv3oIh0fDq-skaUqO7Dxj0_2k0d1s/edit?usp=sharing";
const FIDELITY_SHEET_NAME = "";

const FIDELITY_PLAN_ORDER = ["Mensal", "Trimestral", "Semestral", "Anual"];
const FIDELITY_STATUS_LABELS = {
  active: "Ativo",
  expiring: "Vencendo",
  expired: "Encerrado",
  unknown: "Sem vig\u00EAncia"
};
const FIDELITY_GIFT_LABELS = {
  available: "Dispon\u00EDvel",
  delivered: "Entregue",
  unknown: "N\u00E3o informado"
};

const fidelitySheetStatusElement = document.getElementById("fidelity-sheet-status");
const fidelityPlanButtonsContainer = document.getElementById("fidelity-plan-buttons");
const fidelityStatusButtonsContainer = document.getElementById("fidelity-status-buttons");
const fidelitySearchInputElement = document.getElementById("fidelity-search");
const fidelityTableBodyElement = document.getElementById("fidelity-table-body");
const fidelityCardListElement = document.getElementById("fidelity-card-list");
const fidelityTableHeadingElement = document.getElementById("fidelity-table-heading");
const avatarPreviewModalElement = document.getElementById("avatar-preview-modal");
const avatarPreviewImageElement = document.getElementById("avatar-preview-image");
const avatarPreviewNameElement = document.getElementById("avatar-preview-name");
const avatarPreviewCloseButtonElement = avatarPreviewModalElement.querySelector(".avatar-preview-close");

let fidelityEntries = [];
let fidelityPlans = [];
let selectedPlan = "all";
let selectedStatus = "all";
let lastAvatarTriggerElement = null;

initializeFidelityPage();

function initializeFidelityPage() {
  fidelityPlanButtonsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan]");
    if (!button) {
      return;
    }

    selectedPlan = button.dataset.plan || "all";
    updateFidelityPlanButtons();
    renderFidelity();
  });

  fidelityStatusButtonsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) {
      return;
    }

    selectedStatus = button.dataset.status || "all";
    updateFidelityStatusButtons();
    renderFidelity();
  });

  fidelitySearchInputElement.addEventListener("input", () => {
    renderFidelity();
  });

  fidelityTableBodyElement.addEventListener("click", handleFidelityClick);
  fidelityCardListElement.addEventListener("click", handleFidelityClick);

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

  updateFidelityPlanButtons();
  updateFidelityStatusButtons();
  loadFidelityFromSheet();
}

async function loadFidelityFromSheet() {
  if (!FIDELITY_SHEET_URL) {
    setFidelitySheetStatus("Cole o link da planilha");
    renderFidelityEmptyState("Conecte a planilha em fidelizacao.js para visualizar os planos de fidelizacao.");
    return;
  }

  try {
    setFidelitySheetStatus("Carregando planilha...");
    const csvUrl = buildCsvUrl(FIDELITY_SHEET_URL, FIDELITY_SHEET_NAME);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    const parsedData = parseFidelityCsv(csvContent);

    fidelityEntries = parsedData.entries;
    fidelityPlans = parsedData.plans;
    renderFidelityPlanButtons(fidelityPlans);
    renderFidelity();
    setFidelitySheetStatus("Planilha conectada");
  } catch (error) {
    console.error("Erro ao carregar planos de fidelizacao:", error);
    fidelityEntries = [];
    fidelityPlans = [];
    renderFidelityPlanButtons([]);
    renderFidelityEmptyState(
      "Nao foi possivel carregar a planilha. Verifique o link em fidelizacao.js e confirme se a base esta acessivel."
    );
    setFidelitySheetStatus("Erro ao carregar");
  }
}

function parseFidelityCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (rows.length < 2) {
    return { entries: [], plans: [] };
  }

  const headers = rows[0].map((header, index) => ({
    index,
    normalized: normalizeHeader(header)
  }));

  const athleteIdColumn = findHeader(headers, ["id atleta", "id_atleta", "codigo atleta", "codigo_atleta", "matricula atleta"]);
  const athleteEmailColumn = findHeader(headers, ["email atleta", "email", "e-mail"]);
  const athleteColumn = findHeader(headers, ["atleta", "nome", "corredor"]);
  const avatarColumn = findHeader(headers, ["avatar", "foto", "imagem", "foto perfil", "foto_perfil"]);
  const planColumn = findHeader(headers, ["plano"]);
  const startColumn = findHeader(headers, ["inicio", "data inicio", "inicio"]);
  const endColumn = findHeader(headers, ["termino", "termino do plano", "termino", "fim"]);
  const usedColumn = findHeader(headers, ["desconto vc store utilizado", "desconto utilizado", "utilizado", "usado"]);
  const balanceColumn = findHeader(headers, ["saldo", "saldo disponivel", "saldo disponivel"]);
  const validityColumn = findHeader(headers, ["vigencia ate", "vigencia", "vigencia ate", "vigencia"]);
  const giftsColumn = findHeader(headers, ["brindes", "brinde", "status brindes", "entrega brindes"]);

  if (!athleteColumn) {
    throw new Error("Coluna de atleta nao encontrada na planilha.");
  }

  const entries = rows
    .slice(1)
    .map((row, index) => {
      const athleteId = getCellValue(row, athleteIdColumn ? athleteIdColumn.index : -1);
      const athleteEmail = getCellValue(row, athleteEmailColumn ? athleteEmailColumn.index : -1);
      const athlete = getCellValue(row, athleteColumn.index);
      const rawAvatar = getCellValue(row, avatarColumn ? avatarColumn.index : -1);
      const plan = getCellValue(row, planColumn ? planColumn.index : -1);
      const startText = getCellValue(row, startColumn ? startColumn.index : -1);
      const endText = getCellValue(row, endColumn ? endColumn.index : -1);
      const usedText = getCellValue(row, usedColumn ? usedColumn.index : -1);
      const balanceText = getCellValue(row, balanceColumn ? balanceColumn.index : -1);
      const validityText = getCellValue(row, validityColumn ? validityColumn.index : -1);
      const giftsText = getCellValue(row, giftsColumn ? giftsColumn.index : -1);
      const validityDate = parseBrazilianDate(validityText) || parseBrazilianDate(endText);
      const status = getFidelityStatus(validityDate);
      const giftsStatus = normalizeGiftStatus(giftsText);

      return {
        id: `fidelity-${index}-${normalizeHeader(athlete)}-${normalizeHeader(plan)}`,
        athleteId,
        athleteEmail,
        athlete,
        avatar: resolveAvatarValue(rawAvatar, {
          athleteId,
          athleteEmail,
          athleteName: athlete
        }),
        plan,
        startText,
        endText,
        usedText,
        balanceText,
        validityText: validityText || endText,
        usedValue: parseCurrencyValue(usedText),
        balanceValue: parseCurrencyValue(balanceText),
        validityDate,
        status,
        giftsText: giftsText || (FIDELITY_GIFT_LABELS[giftsStatus] || FIDELITY_GIFT_LABELS.unknown),
        giftsStatus
      };
    })
    .filter((entry) => entry.athlete)
    .sort(sortFidelityEntries);

  const plans = [...new Set(entries.map((entry) => entry.plan).filter(Boolean))].sort(sortPlans);
  return { entries, plans };
}

function renderFidelity() {
  const filteredEntries = filterFidelityEntries(fidelityEntries);

  renderFidelityTable(filteredEntries);
  renderFidelityCards(filteredEntries);
  renderFidelityHeading(filteredEntries.length);
}

function renderFidelityTable(entries) {
  if (!entries.length) {
    fidelityTableBodyElement.innerHTML = `
      <tr>
        <td colspan="9">Nenhum atleta encontrado para o filtro atual.</td>
      </tr>
    `;
    return;
  }

  fidelityTableBodyElement.innerHTML = entries
    .map((entry) => `
      <tr>
        <td>${renderFidelityAthleteIdentity(entry, "table")}</td>
        <td>${escapeHtml(entry.plan || "-")}</td>
        <td>${escapeHtml(entry.startText || "-")}</td>
        <td>${escapeHtml(entry.endText || "-")}</td>
        <td>${escapeHtml(entry.usedText || formatCurrency(entry.usedValue))}</td>
        <td>${escapeHtml(entry.balanceText || formatCurrency(entry.balanceValue))}</td>
        <td>${escapeHtml(entry.validityText || "-")}</td>
        <td>${renderGiftBadge(entry.giftsStatus, entry.giftsText)}</td>
        <td>${renderStatusBadge(entry.status)}</td>
      </tr>
    `)
    .join("");
}

function renderFidelityCards(entries) {
  if (!entries.length) {
    fidelityCardListElement.innerHTML = `
      <article class="fidelity-athlete-card">
        <p class="ranking-card-empty">Nenhum atleta encontrado para o filtro atual.</p>
      </article>
    `;
    return;
  }

  fidelityCardListElement.innerHTML = entries
    .map((entry) => `
      <article class="fidelity-athlete-card">
        <div class="fidelity-athlete-card-top">
          ${renderFidelityAthleteIdentity(entry, "card")}
          ${renderStatusBadge(entry.status)}
        </div>

        <div class="fidelity-meta-grid">
          ${renderCardMetaItem("Inicio", entry.startText)}
          ${renderCardMetaItem("Termino", entry.endText)}
          ${renderCardMetaItem("Utilizado", entry.usedText || formatCurrency(entry.usedValue))}
          ${renderCardMetaItem("Saldo", entry.balanceText || formatCurrency(entry.balanceValue))}
          ${renderCardMetaItem("Vigencia ate", entry.validityText)}
          ${renderCardMetaItem("Brindes", entry.giftsText, renderGiftBadge(entry.giftsStatus, entry.giftsText))}
        </div>
      </article>
    `)
    .join("");
}

function renderCardMetaItem(label, value, overrideValueHtml) {
  return `
    <div class="fidelity-meta-item">
      <span class="fidelity-meta-label">${escapeHtml(label)}</span>
      <strong class="fidelity-meta-value">${overrideValueHtml || escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function renderStatusBadge(status) {
  const label = FIDELITY_STATUS_LABELS[status] || FIDELITY_STATUS_LABELS.unknown;
  const className = `table-status fidelity-status-pill fidelity-status-pill-${status}`;
  return `<span class="${className}">${escapeHtml(label)}</span>`;
}

function renderGiftBadge(status, fallbackText) {
  const label = FIDELITY_GIFT_LABELS[status] || fallbackText || FIDELITY_GIFT_LABELS.unknown;
  const className = `table-status fidelity-gift-pill fidelity-gift-pill-${status || "unknown"}`;
  return `<span class="${className}">${escapeHtml(label)}</span>`;
}

function renderFidelityHeading(resultCount) {
  if (selectedPlan === "all" && selectedStatus === "all") {
    fidelityTableHeadingElement.textContent = "Todos os planos de fidelizacao";
    return;
  }

  const parts = [];

  if (selectedPlan !== "all") {
    parts.push(selectedPlan);
  }

  if (selectedStatus !== "all") {
    parts.push(FIDELITY_STATUS_LABELS[selectedStatus] || selectedStatus);
  }

  fidelityTableHeadingElement.textContent = parts.length
    ? `${parts.join(" • ")} (${resultCount})`
    : "Todos os planos de fidelizacao";
}

function renderFidelityPlanButtons(plans) {
  const availablePlans = ["all", ...plans];

  if (!availablePlans.includes(selectedPlan)) {
    selectedPlan = "all";
  }

  fidelityPlanButtonsContainer.innerHTML = availablePlans
    .map((plan) => {
      const label = plan === "all" ? "Todos os planos" : plan;
      const activeClass = selectedPlan === plan ? " toggle-button-active" : "";

      return `<button type="button" class="toggle-button ranking-category-button${activeClass}" data-plan="${escapeHtmlAttribute(plan)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function updateFidelityPlanButtons() {
  [...fidelityPlanButtonsContainer.querySelectorAll("[data-plan]")].forEach((button) => {
    const isActive = button.dataset.plan === selectedPlan;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateFidelityStatusButtons() {
  [...fidelityStatusButtonsContainer.querySelectorAll("[data-status]")].forEach((button) => {
    const isActive = button.dataset.status === selectedStatus;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function filterFidelityEntries(entries) {
  const normalizedSearch = normalizeHeader(fidelitySearchInputElement.value || "");

  return entries.filter((entry) => {
    const matchesSearch = !normalizedSearch || normalizeHeader(entry.athlete).includes(normalizedSearch);
    const matchesPlan = selectedPlan === "all" || entry.plan === selectedPlan;
    const matchesStatus = selectedStatus === "all" || entry.status === selectedStatus;
    return matchesSearch && matchesPlan && matchesStatus;
  });
}

function renderFidelityEmptyState(message) {
  fidelityTableHeadingElement.textContent = "Todos os planos de fidelizacao";

  fidelityTableBodyElement.innerHTML = `
    <tr>
      <td colspan="9">${escapeHtml(message)}</td>
    </tr>
  `;

  fidelityCardListElement.innerHTML = `
    <article class="fidelity-athlete-card">
      <p class="ranking-card-empty">${escapeHtml(message)}</p>
    </article>
  `;
}

function renderFidelityAthleteIdentity(entry, variant) {
  const safeVariant = variant === "card" ? "card" : "table";
  const athleteName = escapeHtml(entry.athlete);
  const planLabel = escapeHtml(entry.plan || "Plano nao informado");

  if (safeVariant === "card") {
    return `
      <div class="ranking-athlete-identity ranking-athlete-identity-card">
        ${renderFidelityAthleteAvatar(entry, safeVariant)}
        <div class="ranking-athlete-identity-copy">
          <p class="ranking-athlete-name">${athleteName}</p>
          <p class="ranking-athlete-meta">${planLabel}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="ranking-athlete-identity">
      ${renderFidelityAthleteAvatar(entry, safeVariant)}
      <div class="ranking-athlete-identity-copy">
        <span class="ranking-athlete-name-inline">${athleteName}</span>
      </div>
    </div>
  `;
}

function renderFidelityAthleteAvatar(entry, variant) {
  const athleteInitials = escapeHtml(getAthleteInitials(entry.athlete));
  const avatarImage = entry.avatar
    ? `<img src="${escapeHtmlAttribute(entry.avatar)}" alt="" class="athlete-avatar-image" loading="lazy" decoding="async" onerror="this.remove()">`
    : "";

  if (entry.avatar) {
    return `
      <button
        type="button"
        class="athlete-avatar athlete-avatar-${variant} athlete-avatar-button"
        data-avatar-preview="${escapeHtmlAttribute(entry.avatar)}"
        data-avatar-name="${escapeHtmlAttribute(entry.athlete)}"
        title="${escapeHtmlAttribute(entry.athlete)}"
        aria-label="Ampliar foto de ${escapeHtmlAttribute(entry.athlete)}"
      >
        <span class="athlete-avatar-fallback">${athleteInitials}</span>
        ${avatarImage}
      </button>
    `;
  }

  return `
    <span class="athlete-avatar athlete-avatar-${variant}" aria-hidden="true">
      <span class="athlete-avatar-fallback">${athleteInitials}</span>
      ${avatarImage}
    </span>
  `;
}

function handleFidelityClick(event) {
  const avatarButton = event.target.closest("[data-avatar-preview]");
  if (!avatarButton) {
    return;
  }

  openAvatarPreview(avatarButton);
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
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return "VC";
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

function getFidelityStatus(validityDate) {
  if (!validityDate) {
    return "unknown";
  }

  const today = startOfDay(new Date());
  const targetDate = startOfDay(validityDate);
  const diffInDays = Math.round((targetDate.getTime() - today.getTime()) / 86400000);

  if (diffInDays < 0) {
    return "expired";
  }

  if (diffInDays <= 30) {
    return "expiring";
  }

  return "active";
}

function sortFidelityEntries(first, second) {
  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function sortPlans(first, second) {
  const firstIndex = FIDELITY_PLAN_ORDER.indexOf(first);
  const secondIndex = FIDELITY_PLAN_ORDER.indexOf(second);

  if (firstIndex === -1 && secondIndex === -1) {
    return String(first || "").localeCompare(String(second || ""), "pt-BR", { sensitivity: "base" });
  }

  if (firstIndex === -1) {
    return 1;
  }

  if (secondIndex === -1) {
    return -1;
  }

  return firstIndex - secondIndex;
}

function parseBrazilianDate(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return null;
  }

  const directDate = new Date(safeValue);
  if (!Number.isNaN(directDate.getTime()) && /[-/T]/.test(safeValue) && !safeValue.includes(",")) {
    return directDate;
  }

  const match = safeValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  let year = Number(match[3]);

  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }

  const parsedDate = new Date(year, month, day);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseCurrencyValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return 0;
  }

  const normalizedValue = safeValue
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeGiftStatus(value) {
  const normalizedValue = normalizeHeader(value);

  if (!normalizedValue) {
    return "unknown";
  }

  if (
    normalizedValue === "entregue" ||
    normalizedValue === "retirado" ||
    normalizedValue === "recebido"
  ) {
    return "delivered";
  }

  if (
    normalizedValue === "disponivel" ||
    normalizedValue === "disponivel para retirada" ||
    normalizedValue === "pendente" ||
    normalizedValue === "a retirar"
  ) {
    return "available";
  }

  return "unknown";
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function setFidelitySheetStatus(text) {
  fidelitySheetStatusElement.textContent = text;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function findHeader(headers, aliases) {
  return headers.find((header) =>
    aliases.some((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      return header.normalized === normalizedAlias || header.normalized.includes(normalizedAlias);
    })
  );
}

function getCellValue(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function buildCsvUrl(sheetUrl, sheetName) {
  const safeUrl = String(sheetUrl || "").trim();
  const safeSheetName = String(sheetName || "").trim();

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

  if (safeSheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(safeSheetName)}`;
  }

  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
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
  return escapeHtml(value).replace(/`/g, "&#96;");
}
