// Cole aqui o link da planilha do ranking ou o link de exportacao CSV.
const RANKING_SHEET_URL = "https://docs.google.com/spreadsheets/d/10t1-ovZJxhwIPCW64IsOSpN1PPtDe9UZouuERrxUNEY/edit?usp=sharing";
const RANKING_SHEET_NAME = "";

const sheetStatusElement = document.getElementById("ranking-sheet-status");
const searchInputElement = document.getElementById("ranking-search");
const tableBodyElement = document.getElementById("ranking-table-body");
const cardListElement = document.getElementById("ranking-card-list");
const tableHeadingElement = document.getElementById("ranking-table-heading");
const categoryButtonsContainer = document.getElementById("ranking-category-buttons");
const distanceButtonsContainer = document.getElementById("ranking-distance-buttons");
const topFiveContainerElement = document.getElementById("ranking-top-five");
const topFiveStatusElement = document.getElementById("ranking-top-status");
const avatarPreviewModalElement = document.getElementById("avatar-preview-modal");
const avatarPreviewImageElement = document.getElementById("avatar-preview-image");
const avatarPreviewNameElement = document.getElementById("avatar-preview-name");
const avatarPreviewCloseButtonElement = avatarPreviewModalElement.querySelector(".avatar-preview-close");
const viewButtons = [...document.querySelectorAll("[data-view]")];
const genderButtons = [...document.querySelectorAll("[data-gender]")];

let selectedView = "general";
let selectedGender = "all";
let selectedDistance = "all";
let selectedCategory = "all";
let rankingData = createEmptyRankingData();
let expandedEntryIds = new Set();
let lastAvatarTriggerElement = null;

initializeRankingPage();

function initializeRankingPage() {
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedView = button.dataset.view || "general";
      updateToggleButtons(viewButtons, selectedView, "data-view");
      renderRanking();
    });
  });

  genderButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedGender = button.dataset.gender || "all";
      updateToggleButtons(genderButtons, selectedGender, "data-gender");
      renderRanking();
    });
  });

  categoryButtonsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) {
      return;
    }

    selectedCategory = button.dataset.category || "all";
    updateCategoryButtons();
    renderRanking();
  });

  distanceButtonsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-distance]");
    if (!button) {
      return;
    }

    selectedDistance = button.dataset.distance || "all";
    updateDistanceButtons();
    renderRanking();
  });

  tableBodyElement.addEventListener("click", handleRankingClick);
  cardListElement.addEventListener("click", handleRankingClick);
  topFiveContainerElement.addEventListener("click", handleRankingClick);

  searchInputElement.addEventListener("input", () => {
    renderRanking();
  });

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

  updateToggleButtons(viewButtons, selectedView, "data-view");
  updateToggleButtons(genderButtons, selectedGender, "data-gender");
  updateCategoryButtons();
  updateDistanceButtons();
  loadRankingFromSheet();
}

async function loadRankingFromSheet() {
  if (!RANKING_SHEET_URL) {
    setSheetStatus("Cole o link da planilha");
    renderEmptyState("Conecte a planilha em ranking.js para visualizar o ranking do circuito.");
    return;
  }

  try {
    setSheetStatus("Carregando planilha...");
    const csvUrl = buildCsvUrl(RANKING_SHEET_URL);
    const response = await fetch(`${csvUrl}${csvUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const csvContent = await response.text();
    rankingData = parseRankingCsv(csvContent);
    renderDistanceButtons(rankingData.distances);
    renderCategoryButtons(rankingData.categories);
    renderRanking();
    setSheetStatus("Planilha conectada");
  } catch (error) {
    console.error("Erro ao carregar ranking do circuito:", error);
    rankingData = createEmptyRankingData();
    renderDistanceButtons([]);
    renderCategoryButtons([]);
    renderEmptyState(
      "Nao foi possivel carregar a planilha. Verifique o link em ranking.js e confirme se a base esta acessivel."
    );
    setSheetStatus("Erro ao carregar");
  }
}

function parseRankingCsv(csvContent) {
  const rows = parseCsv(csvContent).filter((row) => row.some((cell) => String(cell || "").trim()));

  if (rows.length < 2) {
    return createEmptyRankingData();
  }

  const headers = rows[0].map((header, index) => ({
    index,
    normalized: normalizeHeader(header)
  }));

  const athleteIdColumn = findHeader(headers, ["id atleta", "id_atleta", "codigo atleta", "codigo_atleta", "matricula atleta"]);
  const athleteEmailColumn = findHeader(headers, ["email atleta", "email", "e-mail"]);
  const athleteColumn = findHeader(headers, ["atleta", "nome", "corredor", "competidor"]);
  const categoryColumn = findHeader(headers, ["faixa etaria", "faixa_etaria", "categoria", "faixa"]);
  const sexColumn = findHeader(headers, ["sexo", "genero"]);
  const distanceColumn = findHeader(headers, ["distancia"]);
  const avatarColumn = findHeader(headers, ["avatar", "foto", "imagem", "foto perfil", "foto_perfil"]);
  const stageNumberColumn = findHeader(headers, ["etapa"]);
  const stageNameColumn = findHeader(headers, ["prova"]);
  const dateColumn = findHeader(headers, ["data"]);
  const generalPointsColumn = findHeader(headers, ["pontos geral", "pontuacao geral", "pontos_geral"]);
  const categoryPointsColumn = findHeader(headers, ["pontos categoria", "pontuacao categoria", "pontos_categoria"]);

  if (!athleteColumn) {
    throw new Error("Coluna de atleta nao encontrada na planilha.");
  }

  const stageRows = rows
    .slice(1)
    .map((row) => {
      const athleteId = getCellValue(row, athleteIdColumn ? athleteIdColumn.index : -1);
      const athleteEmail = getCellValue(row, athleteEmailColumn ? athleteEmailColumn.index : -1);
      const athlete = getCellValue(row, athleteColumn.index);
      const rawAvatar = getCellValue(row, avatarColumn ? avatarColumn.index : -1);

      return {
        athleteId,
        athleteEmail,
        athlete,
        category: getCellValue(row, categoryColumn ? categoryColumn.index : -1),
        sex: getCellValue(row, sexColumn ? sexColumn.index : -1),
        distance: normalizeDistance(getCellValue(row, distanceColumn ? distanceColumn.index : -1)),
        avatar: resolveAvatarValue(rawAvatar, {
          athleteId,
          athleteEmail,
          athleteName: athlete
        }),
        stageNumber: getCellValue(row, stageNumberColumn ? stageNumberColumn.index : -1),
        stageName: getCellValue(row, stageNameColumn ? stageNameColumn.index : -1),
        date: getCellValue(row, dateColumn ? dateColumn.index : -1),
        generalPoints: parsePositiveNumber(getCellValue(row, generalPointsColumn ? generalPointsColumn.index : -1)),
        categoryPoints: parsePositiveNumber(getCellValue(row, categoryPointsColumn ? categoryPointsColumn.index : -1))
      };
    })
    .filter((entry) => entry.athlete);

  const categories = [...new Set(stageRows.map((entry) => entry.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
  const distances = [...new Set(stageRows.map((entry) => entry.distance).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );

  return {
    generalEntries: buildRankingEntries(stageRows, "general"),
    categoryEntries: buildRankingEntries(stageRows, "category"),
    categories,
    distances
  };
}

function buildRankingEntries(stageRows, mode) {
  const rankingMap = new Map();

  stageRows.forEach((row) => {
    if (mode === "category" && !row.category) {
      return;
    }

    const athleteKey = buildAthleteGroupKey({
      athleteId: row.athleteId,
      athleteEmail: row.athleteEmail,
      athleteName: row.athlete
    });
    const keyBase = mode === "category"
      ? `${athleteKey}|${row.category.toLowerCase()}`
      : athleteKey;
    const key = `${keyBase}|${row.distance.toLowerCase()}`;

    if (!rankingMap.has(key)) {
      rankingMap.set(key, {
        id: key,
        athleteId: row.athleteId,
        athleteEmail: row.athleteEmail,
        athlete: row.athlete,
        category: row.category,
        sex: row.sex,
        distance: row.distance,
        avatar: row.avatar,
        totalGeneral: 0,
        totalCategory: 0,
        stageDetails: []
      });
    }

    const entry = rankingMap.get(key);
    entry.athleteId = entry.athleteId || row.athleteId;
    entry.athleteEmail = entry.athleteEmail || row.athleteEmail;
    entry.category = entry.category || row.category;
    entry.sex = entry.sex || row.sex;
    entry.distance = entry.distance || row.distance;
    entry.avatar = entry.avatar || row.avatar;
    entry.totalGeneral += row.generalPoints;
    entry.totalCategory += row.categoryPoints;
    entry.stageDetails.push({
      stageNumber: row.stageNumber,
      stageName: row.stageName,
      date: row.date,
      generalPoints: row.generalPoints,
      categoryPoints: row.categoryPoints
    });
  });

  return [...rankingMap.values()]
    .map((entry) => ({
      id: entry.id,
      athleteId: entry.athleteId,
      athleteEmail: entry.athleteEmail,
      athlete: entry.athlete,
      category: entry.category,
      sex: entry.sex,
      distance: entry.distance,
      avatar: entry.avatar,
      totalGeneral: entry.totalGeneral,
      totalCategory: entry.totalCategory,
      total: mode === "general" ? entry.totalGeneral : entry.totalCategory,
      stageDetails: sortStageDetails(entry.stageDetails)
    }))
    .filter((entry) => entry.total > 0)
    .sort(sortRankingEntries);
}

function sortStageDetails(stageDetails) {
  return [...stageDetails].sort((first, second) => {
    const firstStage = Number(first.stageNumber || 0);
    const secondStage = Number(second.stageNumber || 0);
    return firstStage - secondStage;
  });
}

function renderRanking() {
  const currentEntries = filterEntries(
    selectedView === "general" ? rankingData.generalEntries : rankingData.categoryEntries
  );

  renderTopFive(currentEntries);
  renderTable(currentEntries);
  renderCards(currentEntries);
  renderTableHeading();
}

function renderTopFive(entries) {
  const topEntries = entries.slice(0, 5);

  if (!topEntries.length) {
    topFiveContainerElement.innerHTML = `
      <p class="ranking-top-empty">Nenhum atleta encontrado para os filtros selecionados.</p>
    `;
    topFiveStatusElement.textContent = "Sem resultados";
    return;
  }

  topFiveStatusElement.textContent = `${topEntries.length} atleta${topEntries.length === 1 ? "" : "s"} em destaque`;
  topFiveContainerElement.innerHTML = topEntries
    .map((entry, index) => `
      <article
        class="ranking-top-card"
        aria-label="${escapeHtmlAttribute(`Posicao ${index + 1}: ${entry.athlete}`)}"
        title="${escapeHtmlAttribute(entry.athlete)}"
      >
        <span class="ranking-top-position">${index + 1}</span>
        ${renderAthleteAvatar(entry, "top")}
      </article>
    `)
    .join("");
}

function renderTable(entries) {
  if (!entries.length) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="7">Nenhum atleta encontrado para o filtro atual.</td>
      </tr>
    `;
    return;
  }

  tableBodyElement.innerHTML = entries
    .map((entry, index) => {
      const isExpanded = expandedEntryIds.has(entry.id);

      return `
        <tr>
          <td><span class="ranking-position">${index + 1}</span></td>
          <td>${renderAthleteIdentity(entry, "table")}</td>
          <td>${escapeHtml(formatGenderLabel(entry.sex))}</td>
          <td>${escapeHtml(entry.distance || "-")}</td>
          <td>${escapeHtml(entry.category || "-")}</td>
          <td class="ranking-points">${formatPoints(entry.total)}</td>
          <td>
            <button type="button" class="toggle-button ranking-detail-button${isExpanded ? " toggle-button-active" : ""}" data-entry-toggle="${escapeHtmlAttribute(entry.id)}">
              ${isExpanded ? "Ocultar" : "Ver detalhes"}
            </button>
          </td>
        </tr>
        ${isExpanded ? renderDetailRow(entry) : ""}
      `;
    })
    .join("");
}

function renderDetailRow(entry) {
  const detailsHtml = entry.stageDetails
    .map((detail) => `
      <div class="ranking-stage-detail-item">
        <div>
          <p class="ranking-stage-detail-title">Etapa ${escapeHtml(detail.stageNumber || "?")}</p>
          <p class="ranking-stage-detail-meta">${escapeHtml(detail.stageName || "Sem nome")} ${detail.date ? `- ${escapeHtml(detail.date)}` : ""}</p>
        </div>
        <div class="ranking-stage-detail-points">
          <span class="ranking-chip">Geral: ${formatPoints(detail.generalPoints)}</span>
          <span class="ranking-chip ranking-chip-strong">Categoria: ${formatPoints(detail.categoryPoints)}</span>
        </div>
      </div>
    `)
    .join("");

  return `
    <tr class="ranking-detail-row">
      <td colspan="7">
        <div class="ranking-detail-panel">
          ${detailsHtml}
        </div>
      </td>
    </tr>
  `;
}

function renderCards(entries) {
  if (!entries.length) {
    cardListElement.innerHTML = `
      <article class="ranking-athlete-card">
        <p class="ranking-card-empty">Nenhum atleta encontrado para o filtro atual.</p>
      </article>
    `;
    return;
  }

  cardListElement.innerHTML = entries
    .map((entry, index) => {
      const isExpanded = expandedEntryIds.has(entry.id);
      const detailsHtml = isExpanded
        ? `
          <div class="ranking-card-details">
            ${entry.stageDetails
              .map((detail) => `
                <div class="ranking-stage-detail-item">
                  <div>
                    <p class="ranking-stage-detail-title">Etapa ${escapeHtml(detail.stageNumber || "?")}</p>
                    <p class="ranking-stage-detail-meta">${escapeHtml(detail.stageName || "Sem nome")} ${detail.date ? `- ${escapeHtml(detail.date)}` : ""}</p>
                  </div>
                  <div class="ranking-stage-detail-points">
                    <span class="ranking-chip">Geral: ${formatPoints(detail.generalPoints)}</span>
                    <span class="ranking-chip ranking-chip-strong">Categoria: ${formatPoints(detail.categoryPoints)}</span>
                  </div>
                </div>
              `)
              .join("")}
          </div>
        `
        : "";

      return `
        <article class="ranking-athlete-card">
          <div class="ranking-athlete-card-top">
            <span class="ranking-position">${index + 1}</span>
            <div class="ranking-athlete-main">
              ${renderAthleteIdentity(entry, "card")}
            </div>
            <div class="ranking-athlete-total">
              <span class="ranking-athlete-total-label">Total</span>
              <strong>${formatPoints(entry.total)}</strong>
            </div>
          </div>
          <div class="ranking-athlete-card-bottom">
            <button type="button" class="toggle-button ranking-detail-button${isExpanded ? " toggle-button-active" : ""}" data-entry-toggle="${escapeHtmlAttribute(entry.id)}">
              ${isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
            </button>
          </div>
          ${detailsHtml}
        </article>
      `;
    })
    .join("");
}

function renderEmptyState(message) {
  topFiveContainerElement.innerHTML = `
    <p class="ranking-top-empty">${escapeHtml(message)}</p>
  `;
  topFiveStatusElement.textContent = "Indisponivel";
  tableBodyElement.innerHTML = `
    <tr>
      <td colspan="7">${escapeHtml(message)}</td>
    </tr>
  `;

  cardListElement.innerHTML = `
    <article class="ranking-athlete-card">
      <p class="ranking-card-empty">${escapeHtml(message)}</p>
    </article>
  `;
}

function renderCategoryButtons(categories) {
  const availableCategories = ["all", ...categories];

  if (!availableCategories.includes(selectedCategory)) {
    selectedCategory = "all";
  }

  categoryButtonsContainer.innerHTML = availableCategories
    .map((category) => {
      const label = category === "all" ? "Todas as categorias" : category;
      const activeClass = selectedCategory === category ? " toggle-button-active" : "";

      return `<button type="button" class="toggle-button ranking-category-button${activeClass}" data-category="${escapeHtmlAttribute(category)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function renderDistanceButtons(distances) {
  const availableDistances = ["all", ...distances];

  if (!availableDistances.includes(selectedDistance)) {
    selectedDistance = "all";
  }

  distanceButtonsContainer.innerHTML = availableDistances
    .map((distance) => {
      const label = distance === "all" ? "Todas as distancias" : distance;
      const activeClass = selectedDistance === distance ? " toggle-button-active" : "";

      return `<button type="button" class="toggle-button ranking-category-button${activeClass}" data-distance="${escapeHtmlAttribute(distance)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function renderTableHeading() {
  tableHeadingElement.textContent = selectedView === "general" ? "Ranking Geral" : "Ranking por Categoria";
}

function toggleExpandedEntry(entryId) {
  if (!entryId) {
    return;
  }

  if (expandedEntryIds.has(entryId)) {
    expandedEntryIds.delete(entryId);
  } else {
    expandedEntryIds.add(entryId);
  }

  renderRanking();
}

function updateToggleButtons(buttons, selectedValue, attributeName) {
  buttons.forEach((button) => {
    const isActive = button.getAttribute(attributeName) === selectedValue;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateCategoryButtons() {
  [...categoryButtonsContainer.querySelectorAll("[data-category]")].forEach((button) => {
    const isActive = button.dataset.category === selectedCategory;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function updateDistanceButtons() {
  [...distanceButtonsContainer.querySelectorAll("[data-distance]")].forEach((button) => {
    const isActive = button.dataset.distance === selectedDistance;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function handleRankingClick(event) {
  const avatarButton = event.target.closest("[data-avatar-preview]");
  if (avatarButton) {
    openAvatarPreview(avatarButton);
    return;
  }

  const toggleButton = event.target.closest("[data-entry-toggle]");
  if (!toggleButton) {
    return;
  }

  toggleExpandedEntry(toggleButton.dataset.entryToggle);
}

function filterEntries(entries) {
  const normalizedSearch = normalizeHeader(searchInputElement.value || "");

  return entries.filter((entry) => {
    const normalizedAthlete = normalizeHeader(entry.athlete);
    const matchesSearch = !normalizedSearch || normalizedAthlete.includes(normalizedSearch);
    const matchesGender = selectedGender === "all" || normalizeHeader(entry.sex) === normalizeHeader(selectedGender);
    const matchesDistance = selectedDistance === "all" || entry.distance === selectedDistance;
    const matchesCategory = selectedCategory === "all" || entry.category === selectedCategory;
    return matchesSearch && matchesGender && matchesDistance && matchesCategory;
  });
}

function renderAthleteIdentity(entry, variant) {
  const safeVariant = variant === "card" ? "card" : "table";
  const athleteName = escapeHtml(entry.athlete);
  const metadata = `${escapeHtml(formatGenderLabel(entry.sex))} - ${escapeHtml(entry.distance || "-")} - ${escapeHtml(entry.category || "Sem categoria")}`;

  if (safeVariant === "card") {
    return `
      <div class="ranking-athlete-identity ranking-athlete-identity-card">
        ${renderAthleteAvatar(entry, safeVariant)}
        <div class="ranking-athlete-identity-copy">
          <p class="ranking-athlete-name">${athleteName}</p>
          <p class="ranking-athlete-meta">${metadata}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="ranking-athlete-identity">
      ${renderAthleteAvatar(entry, safeVariant)}
      <div class="ranking-athlete-identity-copy">
        <span class="ranking-athlete-name-inline">${athleteName}</span>
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

function buildAthleteGroupKey({ athleteId = "", athleteEmail = "", athleteName = "" } = {}) {
  const athleteIdKey = String(athleteId || "").trim().toLowerCase();
  if (athleteIdKey) {
    return `id:${athleteIdKey}`;
  }

  const athleteEmailKey = String(athleteEmail || "").trim().toLowerCase();
  if (athleteEmailKey) {
    return `email:${athleteEmailKey}`;
  }

  return `name:${normalizeHeader(athleteName)}`;
}

function normalizeDistance(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^3KM$/, "03KM")
    .replace(/^5KM$/, "05KM")
    .replace(/^10KM$/, "10KM");
}

function formatGenderLabel(value) {
  const normalizedValue = normalizeHeader(value);

  if (normalizedValue === "fem") {
    return "Feminino";
  }

  if (normalizedValue === "mas") {
    return "Masculino";
  }

  return value || "Sem genero";
}

function setSheetStatus(text) {
  sheetStatusElement.textContent = text;
}

function sortRankingEntries(first, second) {
  if (second.total !== first.total) {
    return second.total - first.total;
  }

  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function findHeader(headers, aliases) {
  return headers.find((header) =>
    aliases.some((alias) => header.normalized === alias || header.normalized.includes(alias))
  );
}

function getCellValue(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function parsePositiveNumber(value) {
  const numericValue = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
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

function buildCsvUrl(sheetUrl) {
  const safeUrl = String(sheetUrl || "").trim();
  const safeSheetName = String(RANKING_SHEET_NAME || "").trim();

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

function createEmptyRankingData() {
  return {
    generalEntries: [],
    categoryEntries: [],
    categories: [],
    distances: []
  };
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString("pt-BR");
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
