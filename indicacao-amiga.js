// Cole aqui o link da planilha de Indicacao Amiga ou o link de exportacao CSV.
const REFERRAL_SHEET_URL = "https://docs.google.com/spreadsheets/d/11ZhjGBirkPaLFTCcS0_syVUiqR_d90cjGXeDT0yzcv8/edit?usp=sharing";
const REFERRAL_SHEET_NAME = "";

const referralSheetStatusElement = document.getElementById("referral-sheet-status");
const referralSearchInputElement = document.getElementById("referral-search");
const referralTopFiveElement = document.getElementById("referral-top-five");
const referralTopStatusElement = document.getElementById("referral-top-status");
const referralTableBodyElement = document.getElementById("referral-table-body");
const referralCardListElement = document.getElementById("referral-card-list");

let referralEntries = [];

initializeReferralPage();

function initializeReferralPage() {
  referralSearchInputElement.addEventListener("input", () => {
    renderReferralRanking();
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

  const athleteColumnIndex = athleteHeader ? athleteHeader.index : 0;
  const referralsColumnIndex = referralsHeader ? referralsHeader.index : 1;
  const dataRows = athleteHeader || referralsHeader ? rows.slice(1) : rows;
  const groupedEntries = new Map();

  dataRows.forEach((row) => {
    const athlete = getCellValue(row, athleteColumnIndex).replace(/\s+/g, " ").trim();
    const referrals = parseReferralCount(getCellValue(row, referralsColumnIndex));

    if (!athlete) {
      return;
    }

    const athleteKey = normalizeHeader(athlete);
    if (!groupedEntries.has(athleteKey)) {
      groupedEntries.set(athleteKey, {
        athlete,
        referrals: 0
      });
    }

    groupedEntries.get(athleteKey).referrals += referrals;
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
  const topEntries = entries.slice(0, 5);

  if (!topEntries.length) {
    referralTopFiveElement.innerHTML = `
      <p class="ranking-top-empty">Nenhum atleta encontrado para a busca atual.</p>
    `;
    referralTopStatusElement.textContent = "Sem resultados";
    return;
  }

  referralTopStatusElement.textContent = `${topEntries.length} atleta${topEntries.length === 1 ? "" : "s"} em destaque`;
  referralTopFiveElement.innerHTML = topEntries
    .map((entry, index) => `
      <article class="ranking-top-card" aria-label="${escapeHtmlAttribute(`Posicao ${index + 1}: ${entry.athlete}`)}">
        <span class="ranking-top-position">${index + 1}</span>
        <p class="referral-top-name">${escapeHtml(entry.athlete)}</p>
        <span class="referral-top-count">${escapeHtml(formatReferralCount(entry.referrals))}</span>
      </article>
    `)
    .join("");
}

function renderReferralTable(entries) {
  if (!entries.length) {
    referralTableBodyElement.innerHTML = `
      <tr>
        <td colspan="3">Nenhum atleta encontrado para a busca atual.</td>
      </tr>
    `;
    return;
  }

  referralTableBodyElement.innerHTML = entries
    .map((entry, index) => `
      <tr>
        <td><span class="ranking-position">${index + 1}</span></td>
        <td>${escapeHtml(entry.athlete)}</td>
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
            <p class="ranking-athlete-name">${escapeHtml(entry.athlete)}</p>
          </div>
          <div class="ranking-athlete-total">
            <span class="ranking-athlete-total-label">Indica\u00E7\u00F5es</span>
            <strong>${escapeHtml(formatNumber(entry.referrals))}</strong>
          </div>
        </div>
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
      <td colspan="3">${escapeHtml(message)}</td>
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

function setReferralSheetStatus(text) {
  referralSheetStatusElement.textContent = text;
}

function sortReferralEntries(first, second) {
  if (second.referrals !== first.referrals) {
    return second.referrals - first.referrals;
  }

  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function parseReferralCount(value) {
  const normalizedValue = String(value || "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
}

function formatReferralCount(value) {
  const formattedNumber = formatNumber(value);
  return `${formattedNumber} indica\u00E7\u00E3o${Number(value) === 1 ? "" : "\u00F5es"}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
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
