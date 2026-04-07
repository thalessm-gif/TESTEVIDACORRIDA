// Cole aqui o link da planilha de Indicacao Amiga ou o link de exportacao CSV.
const REFERRAL_SHEET_URL = "https://docs.google.com/spreadsheets/d/11ZhjGBirkPaLFTCcS0_syVUiqR_d90cjGXeDT0yzcv8/edit?usp=sharing";
const REFERRAL_SHEET_NAME = "";

const referralSheetStatusElement = document.getElementById("referral-sheet-status");
const referralSearchInputElement = document.getElementById("referral-search");
const referralTopFiveElement = document.getElementById("referral-top-five");
const referralTopStatusElement = document.getElementById("referral-top-status");
const referralTableBodyElement = document.getElementById("referral-table-body");
const referralCardListElement = document.getElementById("referral-card-list");
const avatarPreviewModalElement = document.getElementById("avatar-preview-modal");
const avatarPreviewImageElement = document.getElementById("avatar-preview-image");
const avatarPreviewNameElement = document.getElementById("avatar-preview-name");
const avatarPreviewCloseButtonElement = avatarPreviewModalElement.querySelector(".avatar-preview-close");

let referralEntries = [];
let lastAvatarTriggerElement = null;

initializeReferralPage();

function initializeReferralPage() {
  referralSearchInputElement.addEventListener("input", () => {
    renderReferralRanking();
  });

  referralTopFiveElement.addEventListener("click", handleReferralClick);
  referralTableBodyElement.addEventListener("click", handleReferralClick);
  referralCardListElement.addEventListener("click", handleReferralClick);

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

  loadReferralRankingFromSheet();
}

async function loadReferralRankingFromSheet() {
  if (!REFERRAL_SHEET_URL) {
    setReferralSheetStatus("Cole o link da planilha");
    renderReferralEmptyState("Conecte a planilha em indicacao-amiga.js para visualizar a Indicacao Amiga.");
    return;
  }

  try {
    setReferralSheetStatus("Carregando planilha...");
    const csvUrl = buildCsvUrl(REFERRAL_SHEET_URL, REFERRAL_SHEET_NAME);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    referralEntries = parseReferralCsv(csvContent);
    renderReferralRanking();
    setReferralSheetStatus("Planilha conectada");
  } catch (error) {
    console.error("Erro ao carregar Indicacao Amiga:", error);
    referralEntries = [];
    renderReferralEmptyState(
      "Nao foi possivel carregar a planilha. Verifique o link em indicacao-amiga.js e confirme se a base esta acessivel."
    );
    setReferralSheetStatus("Erro ao carregar");
  }
}

function parseReferralCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (!rows.length) {
    return [];
  }

  const firstRowHeaders = rows[0].map((header, index) => ({
    index,
    normalized: normalizeHeader(header)
  }));

  const athleteHeader = findHeader(firstRowHeaders, ["atleta", "nome", "corredor", "competidor"]);
  const referralsHeader = findHeader(firstRowHeaders, [
    "quantidade de indicacoes",
    "quantidade indicacoes",
    "indicacoes",
    "indicacao",
    "qtd indicacoes",
    "total indicacoes",
    "quantidade"
  ]);
  const avatarHeader = findHeader(firstRowHeaders, ["avatar", "foto", "imagem", "foto perfil", "foto_perfil"]);
  const levelHeader = findHeader(firstRowHeaders, ["nivel", "nivel de indicacao", "nivel indicacao"]);

  const athleteColumnIndex = athleteHeader ? athleteHeader.index : 0;
  const referralsColumnIndex = referralsHeader ? referralsHeader.index : 1;
  const avatarColumnIndex = avatarHeader ? avatarHeader.index : -1;
  const levelColumnIndex = levelHeader ? levelHeader.index : -1;
  const dataRows = athleteHeader || referralsHeader ? rows.slice(1) : rows;
  const groupedEntries = new Map();

  dataRows.forEach((row) => {
    const athlete = getCellValue(row, athleteColumnIndex).replace(/\s+/g, " ").trim();
    const referrals = parseReferralCount(getCellValue(row, referralsColumnIndex));
    const avatar = normalizeAvatarValue(getCellValue(row, avatarColumnIndex));
    const level = normalizeLevelValue(getCellValue(row, levelColumnIndex));

    if (!athlete) {
      return;
    }

    const athleteKey = normalizeHeader(athlete);
    if (!groupedEntries.has(athleteKey)) {
      groupedEntries.set(athleteKey, {
        athlete,
        referrals: 0,
        avatar: "",
        level: ""
      });
    }

    const entry = groupedEntries.get(athleteKey);
    entry.referrals += referrals;
    entry.avatar = entry.avatar || avatar;
    entry.level = getPreferredLevelLabel(entry.level, level);
  });

  return [...groupedEntries.values()].sort(sortReferralEntries);
}

function renderReferralRanking() {
  const filteredEntries = filterReferralEntries(referralEntries);
  renderReferralTopFive(filteredEntries);
  renderReferralTable(filteredEntries);
  renderReferralCards(filteredEntries);
}

function renderReferralTopFive(entries) {
  const topEntries = entries
    .filter((entry) => hasPositiveReferralCount(entry.referrals))
    .slice(0, 5);

  if (!topEntries.length) {
    referralTopFiveElement.innerHTML = `
      <p class="ranking-top-empty">Nenhum atleta com indica&#231;&#245;es para a busca atual.</p>
    `;
    referralTopStatusElement.textContent = "Sem resultados";
    return;
  }

  referralTopStatusElement.textContent = `${topEntries.length} atleta${topEntries.length === 1 ? "" : "s"} em destaque`;
  referralTopFiveElement.innerHTML = topEntries
    .map((entry, index) => `
      <article class="ranking-top-card" aria-label="${escapeHtmlAttribute(`Posicao ${index + 1}: ${entry.athlete}`)}">
        <span class="ranking-top-position">${index + 1}</span>
        ${renderAthleteAvatar(entry, "top")}
        <p class="referral-top-name">${escapeHtml(entry.athlete)}</p>
        ${entry.level ? `<span class="referral-level-pill">${escapeHtml(entry.level)}</span>` : ""}
        <span class="referral-top-count">${escapeHtml(formatReferralCount(entry.referrals))}</span>
      </article>
    `)
    .join("");
}

function renderReferralTable(entries) {
  if (!entries.length) {
    referralTableBodyElement.innerHTML = `
      <tr>
        <td colspan="4">Nenhum atleta encontrado para a busca atual.</td>
      </tr>
    `;
    return;
  }

  referralTableBodyElement.innerHTML = entries
    .map((entry, index) => `
      <tr>
        <td><span class="ranking-position">${index + 1}</span></td>
        <td>${renderReferralAthleteIdentity(entry, "table")}</td>
        <td>${entry.level ? `<span class="referral-level-pill">${escapeHtml(entry.level)}</span>` : "-"}</td>
        <td class="ranking-points">${escapeHtml(formatNumber(entry.referrals))}</td>
      </tr>
    `)
    .join("");
}

function renderReferralCards(entries) {
  if (!entries.length) {
    referralCardListElement.innerHTML = `
      <article class="ranking-athlete-card">
        <p class="ranking-card-empty">Nenhum atleta encontrado para a busca atual.</p>
      </article>
    `;
    return;
  }

  referralCardListElement.innerHTML = entries
    .map((entry, index) => `
      <article class="ranking-athlete-card">
        <div class="ranking-athlete-card-top">
          <span class="ranking-position">${index + 1}</span>
          <div class="ranking-athlete-main">
            ${renderReferralAthleteIdentity(entry, "card")}
          </div>
          <div class="ranking-athlete-total">
            <span class="ranking-athlete-total-label">Indica\u00E7\u00F5es</span>
            <strong>${escapeHtml(formatNumber(entry.referrals))}</strong>
          </div>
        </div>
        ${entry.level ? `<div class="ranking-athlete-card-bottom"><span class="referral-level-pill">${escapeHtml(entry.level)}</span></div>` : ""}
      </article>
    `)
    .join("");
}

function renderReferralEmptyState(message) {
  referralTopFiveElement.innerHTML = `
    <p class="ranking-top-empty">${escapeHtml(message)}</p>
  `;
  referralTopStatusElement.textContent = "Indisponivel";
  referralTableBodyElement.innerHTML = `
    <tr>
      <td colspan="4">${escapeHtml(message)}</td>
    </tr>
  `;
  referralCardListElement.innerHTML = `
    <article class="ranking-athlete-card">
      <p class="ranking-card-empty">${escapeHtml(message)}</p>
    </article>
  `;
}

function filterReferralEntries(entries) {
  const normalizedSearch = normalizeHeader(referralSearchInputElement.value || "");

  return entries.filter((entry) => {
    const normalizedAthlete = normalizeHeader(entry.athlete);
    return !normalizedSearch || normalizedAthlete.includes(normalizedSearch);
  });
}

function handleReferralClick(event) {
  const avatarButton = event.target.closest("[data-avatar-preview]");
  if (!avatarButton) {
    return;
  }

  openAvatarPreview(avatarButton);
}

function setReferralSheetStatus(text) {
  referralSheetStatusElement.textContent = text;
}

function sortReferralEntries(first, second) {
  const firstReferrals = getReferralCountValue(first.referrals);
  const secondReferrals = getReferralCountValue(second.referrals);

  if (secondReferrals !== firstReferrals) {
    return secondReferrals - firstReferrals;
  }

  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function hasPositiveReferralCount(value) {
  return getReferralCountValue(value) > 0;
}

function getReferralCountValue(value) {
  return parseReferralCount(value);
}

function getPreferredLevelLabel(currentLevel, nextLevel) {
  if (!currentLevel) {
    return nextLevel;
  }

  if (!nextLevel) {
    return currentLevel;
  }

  return getLevelWeight(nextLevel) > getLevelWeight(currentLevel) ? nextLevel : currentLevel;
}

function parseReferralCount(value) {
  const normalizedValue = String(value || "")
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
}

function formatReferralCount(value) {
  const numericValue = getReferralCountValue(value);
  const formattedNumber = formatNumber(numericValue);
  const label = numericValue === 1 ? "indica\u00E7\u00E3o" : "indica\u00E7\u00F5es";
  return `${formattedNumber} ${label}`;
}

function formatNumber(value) {
  return getReferralCountValue(value).toLocaleString("pt-BR");
}

function normalizeLevelValue(value) {
  const safeValue = String(value || "").trim().replace(/\s+/g, " ");
  if (!safeValue) {
    return "";
  }

  const levelMatch = safeValue.match(/\d+/);
  if (levelMatch) {
    return `N\u00EDvel ${levelMatch[0]}`;
  }

  return safeValue;
}

function getLevelWeight(level) {
  const safeLevel = String(level || "").trim();
  const levelMatch = safeLevel.match(/\d+/);
  return levelMatch ? Number(levelMatch[0]) : 0;
}

function renderReferralAthleteIdentity(entry, variant) {
  if (variant === "card") {
    return `
      <div class="ranking-athlete-identity ranking-athlete-identity-card">
        ${renderAthleteAvatar(entry, "card")}
        <div class="ranking-athlete-identity-copy">
          <p class="ranking-athlete-name">${escapeHtml(entry.athlete)}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="ranking-athlete-identity">
      ${renderAthleteAvatar(entry, "table")}
      <div class="ranking-athlete-identity-copy">
        <span class="ranking-athlete-name-inline">${escapeHtml(entry.athlete)}</span>
      </div>
    </div>
  `;
}

function renderAthleteAvatar(entry, variant) {
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

  if (/^(https?:)?\/\//i.test(safeValue) || /^data:/i.test(safeValue) || safeValue.startsWith("/")) {
    return safeValue;
  }

  if (/^(?:\.{1,2}\/)?assets\//i.test(safeValue) || safeValue.startsWith("./") || safeValue.startsWith("../")) {
    return safeValue;
  }

  return `assets/avatars/${safeValue}`;
}

function findHeader(headers, aliases) {
  return headers.find((header) =>
    aliases.some((alias) => header.normalized === alias || header.normalized.includes(alias))
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
