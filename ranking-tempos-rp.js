const RP_RANKING_SYSTEM_CONFIG = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const RP_RANKING_SHARED_GOOGLE_SCRIPT_URL = String(
  ((RP_RANKING_SYSTEM_CONFIG.googleAppsScript || {}).url) || ""
).trim();
const RP_RANKING_FEATURE_CONFIG = RP_RANKING_SYSTEM_CONFIG.rankingPerformance || {};
const RP_RANKING_STORAGE_KEY = "momento-rp-entries";
const RP_RANKING_GOOGLE_SCRIPT_URL = RP_RANKING_SHARED_GOOGLE_SCRIPT_URL;
const RP_RANKING_LIST_ACTION = String(RP_RANKING_FEATURE_CONFIG.listAction || "rp-list").trim();
const RP_FIRST_RACE_LABEL = "Primeira prova";
const RP_CATEGORY_ORDER = [
  "18 a 29 anos",
  "30 a 39 anos",
  "40 a 49 anos",
  "50 anos ou mais"
];

const statusElement = document.getElementById("rp-ranking-status");
const searchInputElement = document.getElementById("rp-ranking-search");
const tableBodyElement = document.getElementById("rp-ranking-table-body");
const cardListElement = document.getElementById("rp-ranking-card-list");
const tableHeadingElement = document.getElementById("rp-ranking-table-heading");
const categoryButtonsContainer = document.getElementById("rp-ranking-category-buttons");
const distanceButtonsContainer = document.getElementById("rp-ranking-distance-buttons");
const topFiveContainerElement = document.getElementById("rp-ranking-top-five");
const topFiveStatusElement = document.getElementById("rp-ranking-top-status");
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
  searchInputElement.addEventListener("input", renderRanking);

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
  loadRankingData();
}

async function loadRankingData() {
  setStatus("Carregando Momento RP");
  renderEmptyState("Carregando ranking de tempos do Momento RP.");

  try {
    const { entries, source } = await loadRankingEntries();
    rankingData = buildRankingData(entries);
    renderDistanceButtons(rankingData.distances);
    renderCategoryButtons(rankingData.categories);
    renderRanking();

    if (rankingData.totalRecords) {
      setStatus(source === "local" ? "Dados locais carregados" : "Momento RP conectado");
      return;
    }

    setStatus(source === "local" ? "Sem dados locais" : "Sem registros");
  } catch (error) {
    console.error("Erro ao carregar ranking de tempos do Momento RP:", error);
    rankingData = createEmptyRankingData();
    renderDistanceButtons([]);
    renderCategoryButtons([]);
    renderEmptyState("Não foi possível carregar os registros do Momento RP agora.");
    setStatus("Erro ao carregar");
  }
}

async function loadRankingEntries() {
  const localEntries = loadRpEntriesFromLocalStorage();

  if (isRpGoogleScriptConfigured()) {
    try {
      const remoteEntries = await loadRpEntriesFromGoogleSheets();
      return {
        entries: remoteEntries,
        source: "remote"
      };
    } catch (error) {
      if (localEntries.length) {
        return {
          entries: localEntries,
          source: "local"
        };
      }

      throw error;
    }
  }

  if (localEntries.length) {
    return {
      entries: localEntries,
      source: "local"
    };
  }

  return {
    entries: [],
    source: "empty"
  };
}

async function loadRpEntriesFromGoogleSheets() {
  const separator = RP_RANKING_GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
  const response = await fetch(
    `${RP_RANKING_GOOGLE_SCRIPT_URL}${separator}action=${RP_RANKING_LIST_ACTION}&ts=${Date.now()}`
  );

  if (!response.ok) {
    throw new Error(`Resposta inesperada: ${response.status}`);
  }

  const data = await safeReadJsonResponse(response);
  if (!data.ok) {
    throw new Error(String(data.message || "A consulta do Momento RP foi rejeitada."));
  }

  return Array.isArray(data.entries) ? data.entries.map(normalizeRpEntry).filter(Boolean) : [];
}

function loadRpEntriesFromLocalStorage() {
  try {
    const rawEntries = localStorage.getItem(RP_RANKING_STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeRpEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao ler os registros locais do Momento RP:", error);
    return [];
  }
}

function buildRankingData(entries) {
  const validEntries = entries
    .map(normalizeRpEntry)
    .filter(Boolean)
    .map((entry) => ({
      ...entry,
      timeSeconds: parseTimeToSeconds(entry.time)
    }))
    .filter((entry) => entry.distance && entry.timeSeconds > 0);

  const distances = [...new Set(validEntries.map((entry) => entry.distance).filter(Boolean))].sort(sortDistanceLabels);
  const categories = [...new Set(validEntries.map((entry) => entry.category).filter(Boolean))].sort(sortCategoryLabels);
  const athleteKeys = new Set(validEntries.map((entry) => buildAthleteGroupKey(entry.athleteName)));

  return {
    generalEntries: buildRankingEntries(validEntries, "general"),
    categoryEntries: buildRankingEntries(validEntries, "category"),
    categories,
    distances,
    totalRecords: validEntries.length,
    totalAthletes: athleteKeys.size
  };
}

function buildRankingEntries(entries, mode) {
  const rankingMap = new Map();

  entries.forEach((entry) => {
    if (mode === "category" && !entry.category) {
      return;
    }

    const athleteKey = buildAthleteGroupKey(entry.athleteName);
    const categoryKey = mode === "category" ? `|${normalizeHeader(entry.category)}` : "";
    const mapKey = `${athleteKey}${categoryKey}|${normalizeHeader(entry.distance)}`;

    if (!rankingMap.has(mapKey)) {
      rankingMap.set(mapKey, {
        id: mapKey,
        athlete: entry.athleteName,
        sex: entry.gender,
        category: entry.category,
        distance: entry.distance,
        bestHistoryEntry: null,
        history: []
      });
    }

    const rankingEntry = rankingMap.get(mapKey);
    const historyEntry = buildHistoryEntry(entry);

    rankingEntry.athlete = rankingEntry.athlete || entry.athleteName;
    rankingEntry.sex = rankingEntry.sex || entry.gender;
    rankingEntry.category = rankingEntry.category || entry.category;
    rankingEntry.distance = rankingEntry.distance || entry.distance;
    rankingEntry.history.push(historyEntry);

    if (!rankingEntry.bestHistoryEntry || isBetterPerformance(historyEntry, rankingEntry.bestHistoryEntry)) {
      rankingEntry.bestHistoryEntry = historyEntry;
    }
  });

  return [...rankingMap.values()]
    .map((entry) => {
      const bestHistoryEntry = entry.bestHistoryEntry;
      const history = sortHistoryEntries(entry.history).map((historyEntry) => ({
        ...historyEntry,
        isBest: historyEntry.historyId === bestHistoryEntry.historyId
      }));
      const searchIndex = normalizeHeader(
        [
          entry.athlete,
          bestHistoryEntry.raceName,
          ...history.map((historyEntry) => historyEntry.raceName)
        ].join(" ")
      );

      return {
        id: entry.id,
        athlete: entry.athlete,
        sex: entry.sex,
        category: mode === "category" ? entry.category : (bestHistoryEntry.category || entry.category),
        distance: entry.distance,
        avatar: resolveAvatarValue("", "", entry.athlete),
        bestTimeLabel: bestHistoryEntry.timeLabel,
        bestTimeSeconds: bestHistoryEntry.timeSeconds,
        bestRaceName: bestHistoryEntry.raceName,
        bestRaceDate: bestHistoryEntry.raceDate,
        recordCount: history.length,
        history,
        searchIndex
      };
    })
    .sort(sortRankingEntries);
}

function buildHistoryEntry(entry) {
  const previousTimeSeconds = parseTimeToSeconds(entry.previousTime);
  const hasPreviousTime = previousTimeSeconds > 0;
  const improvementSeconds = hasPreviousTime ? previousTimeSeconds - entry.timeSeconds : 0;
  const normalizedPodium = normalizeText(entry.podium);
  const hasPodium = normalizedPodium && normalizeHeader(normalizedPodium) !== "nenhum podio";

  return {
    historyId: buildHistoryKey(entry),
    raceName: entry.raceName,
    raceDate: entry.raceDate,
    createdAt: entry.createdAt,
    timeLabel: normalizeTimeValue(entry.time) || entry.time,
    timeSeconds: entry.timeSeconds,
    previousTimeLabel: hasPreviousTime ? normalizeTimeValue(entry.previousTime) : "",
    previousTimeSeconds,
    improvementLabel: improvementSeconds > 0 ? formatDurationFromSeconds(improvementSeconds) : "",
    podiumLabel: hasPodium ? normalizedPodium : "",
    category: entry.category,
    sex: entry.gender
  };
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
      <article class="ranking-top-card rp-ranking-top-card" aria-label="${escapeHtmlAttribute(`Posição ${index + 1}: ${entry.athlete}`)}">
        <span class="ranking-top-position">${index + 1}</span>
        ${renderAthleteAvatar(entry, "top")}
        <strong class="rp-ranking-top-time">${escapeHtml(entry.bestTimeLabel)}</strong>
        <p class="rp-ranking-top-name">${escapeHtml(entry.athlete)}</p>
        <p class="rp-ranking-top-meta">${escapeHtml(entry.distance)}${entry.category ? ` - ${escapeHtml(entry.category)}` : ""}</p>
        <p class="rp-ranking-top-race">${escapeHtml(entry.bestRaceName || "Sem prova")} ${entry.bestRaceDate ? `- ${escapeHtml(formatRaceDate(entry.bestRaceDate))}` : ""}</p>
      </article>
    `)
    .join("");
}

function renderTable(entries) {
  if (!entries.length) {
    tableBodyElement.innerHTML = `
      <tr>
        <td colspan="8">Nenhum atleta encontrado para o filtro atual.</td>
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
          <td class="ranking-points">${escapeHtml(entry.bestTimeLabel)}</td>
          <td>${renderBestRaceCell(entry)}</td>
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
  return `
    <tr class="ranking-detail-row">
      <td colspan="8">
        <div class="ranking-detail-panel">
          ${renderHistoryDetails(entry)}
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
            ${renderHistoryDetails(entry)}
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
              <span class="ranking-athlete-total-label">Melhor tempo</span>
              <strong>${escapeHtml(entry.bestTimeLabel)}</strong>
            </div>
          </div>
          <div class="rp-ranking-card-race">
            <strong>${escapeHtml(entry.bestRaceName || "Sem prova")}</strong>
            <span>${escapeHtml(formatRaceDate(entry.bestRaceDate))}</span>
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

function renderHistoryDetails(entry) {
  return entry.history
    .map((detail) => `
      <div class="ranking-stage-detail-item rp-ranking-history-item">
        <div class="rp-ranking-history-main">
          <p class="ranking-stage-detail-title">${escapeHtml(detail.raceName || "Sem prova")}</p>
          <p class="ranking-stage-detail-meta">${escapeHtml(formatRaceDate(detail.raceDate))} - ${escapeHtml(entry.distance || "-")} - ${escapeHtml(detail.category || entry.category || "Sem categoria")}</p>
        </div>
        <div class="ranking-stage-detail-points">
          <span class="ranking-chip ranking-chip-strong">Tempo: ${escapeHtml(detail.timeLabel)}</span>
          ${detail.isBest ? '<span class="ranking-chip">Melhor marca atual</span>' : ""}
          ${detail.previousTimeLabel ? `<span class="ranking-chip">Anterior: ${escapeHtml(detail.previousTimeLabel)}</span>` : ""}
          ${detail.improvementLabel ? `<span class="ranking-chip">Melhora: ${escapeHtml(detail.improvementLabel)}</span>` : ""}
          ${detail.podiumLabel ? `<span class="ranking-chip">${escapeHtml(detail.podiumLabel)}</span>` : ""}
        </div>
      </div>
    `)
    .join("");
}

function renderEmptyState(message) {
  const safeMessage = escapeHtml(message);

  topFiveContainerElement.innerHTML = `
    <p class="ranking-top-empty">${safeMessage}</p>
  `;
  topFiveStatusElement.textContent = "Indisponível";
  tableBodyElement.innerHTML = `
    <tr>
      <td colspan="8">${safeMessage}</td>
    </tr>
  `;

  cardListElement.innerHTML = `
    <article class="ranking-athlete-card">
      <p class="ranking-card-empty">${safeMessage}</p>
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
      const label = distance === "all" ? "Todas as distâncias" : distance;
      const activeClass = selectedDistance === distance ? " toggle-button-active" : "";

      return `<button type="button" class="toggle-button ranking-category-button${activeClass}" data-distance="${escapeHtmlAttribute(distance)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function renderTableHeading() {
  tableHeadingElement.textContent = selectedView === "general"
    ? "Ranking Geral por Tempo"
    : "Ranking por Categoria";
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

function filterEntries(entries) {
  const normalizedSearch = normalizeHeader(searchInputElement.value || "");

  return entries.filter((entry) => {
    const matchesSearch = !normalizedSearch || entry.searchIndex.includes(normalizedSearch);
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
      <div class="ranking-athlete-identity ranking-athlete-identity-card rp-ranking-athlete-card-copy">
        ${renderAthleteAvatar(entry, safeVariant)}
        <div class="ranking-athlete-identity-copy">
          <p class="ranking-athlete-name">${athleteName}</p>
          <p class="ranking-athlete-meta">${metadata}</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="ranking-athlete-identity rp-ranking-athlete-cell">
      ${renderAthleteAvatar(entry, safeVariant)}
      <div class="ranking-athlete-identity-copy">
        <span class="ranking-athlete-name-inline">${athleteName}</span>
      </div>
    </div>
  `;
}

function renderBestRaceCell(entry) {
  return `
    <div class="rp-ranking-race-cell">
      <strong>${escapeHtml(entry.bestRaceName || "Sem prova")}</strong>
      <span>${escapeHtml(formatRaceDate(entry.bestRaceDate))}</span>
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

function normalizeRpEntry(entry) {
  if (!entry) {
    return null;
  }

  const normalizedEntry = {
    id: String(entry.id || buildHistoryKey(entry)),
    athleteName: normalizeText(entry.athleteName || entry.athlete || entry.nome),
    raceName: normalizeText(entry.raceName || entry.prova),
    raceDate: normalizeDateOnlyValue(entry.raceDate || entry.date || entry.data),
    previousTime: normalizePreviousTimeValue(entry.previousTime || entry.tempoAnterior),
    time: normalizeTimeValue(entry.time || entry.tempo) || normalizeText(entry.time || entry.tempo),
    distance: normalizeDistanceLabel(entry.distance || entry.distancia),
    gender: normalizeGenderLabel(entry.gender || entry.sex || entry.genero),
    category: normalizeCategoryLabel(entry.category || entry.categoria),
    podium: normalizeText(entry.podium || entry.resultado || entry.podio),
    createdAt: normalizeDateTimeValue(entry.createdAt || entry.created_at || entry.dataCriacao)
  };

  if (!normalizedEntry.athleteName || !normalizedEntry.raceName || !normalizedEntry.raceDate) {
    return null;
  }

  return normalizedEntry;
}

function buildAthleteGroupKey(name) {
  return `name:${normalizeHeader(name)}`;
}

function buildHistoryKey(entry) {
  return [
    normalizeText(entry && entry.id),
    normalizeText(entry && entry.athleteName),
    normalizeText(entry && entry.raceName),
    normalizeDateOnlyValue(entry && entry.raceDate),
    normalizeTimeValue(entry && entry.time)
  ].join("|");
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

function resolveAvatarValue(athleteId = "", athleteEmail = "", athleteName = "") {
  const mappedAvatar = getMappedAvatarValue(athleteId, athleteEmail, athleteName);
  if (mappedAvatar) {
    return normalizeAvatarValue(mappedAvatar);
  }

  return "";
}

function getMappedAvatarValue(athleteId = "", athleteEmail = "", athleteName = "") {
  if (typeof window.getVidaCorridaMappedAvatar !== "function") {
    return "";
  }

  return window.getVidaCorridaMappedAvatar({
    athleteId,
    athleteEmail,
    athleteName
  });
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function normalizeDateOnlyValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(safeValue)) {
    return safeValue.slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
    return safeValue;
  }

  const slashMatch = safeValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsedDate = new Date(safeValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateTimeValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  const parsedDate = new Date(safeValue);
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function normalizeTimeValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(safeValue)) {
    const parts = safeValue.split(":");
    if (parts.length === 2) {
      return `${parts[0].padStart(2, "0")}:${parts[1]}`;
    }

    return `${parts[0].padStart(2, "0")}:${parts[1]}:${parts[2]}`;
  }

  const embeddedTimeMatch = safeValue.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!embeddedTimeMatch) {
    return "";
  }

  const [, hours, minutes, seconds] = embeddedTimeMatch;
  return seconds
    ? `${hours.padStart(2, "0")}:${minutes}:${seconds}`
    : `${hours.padStart(2, "0")}:${minutes}`;
}

function normalizePreviousTimeValue(value) {
  const safeValue = normalizeText(value);
  if (!safeValue) {
    return RP_FIRST_RACE_LABEL;
  }

  return normalizeHeader(safeValue) === normalizeHeader(RP_FIRST_RACE_LABEL)
    ? RP_FIRST_RACE_LABEL
    : normalizeTimeValue(safeValue);
}

function normalizeDistanceLabel(value) {
  const safeValue = normalizeText(value);
  if (!safeValue) {
    return "";
  }

  const distanceMatch = safeValue.match(/^(\d+(?:[.,]\d+)?)\s*km$/i);
  if (distanceMatch) {
    return `${distanceMatch[1].replace(",", ".")} km`;
  }

  return safeValue;
}

function normalizeGenderLabel(value) {
  const normalizedValue = normalizeHeader(value);

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue === "fem" || normalizedValue === "feminino") {
    return "FEM";
  }

  if (normalizedValue === "mas" || normalizedValue === "masculino") {
    return "MAS";
  }

  return normalizeText(value);
}

function normalizeCategoryLabel(value) {
  const safeValue = normalizeText(value);
  if (!safeValue) {
    return "";
  }

  const knownCategory = RP_CATEGORY_ORDER.find((category) => normalizeHeader(category) === normalizeHeader(safeValue));
  return knownCategory || safeValue;
}

function parseTimeToSeconds(value) {
  const normalizedTime = normalizeTimeValue(value);
  if (!normalizedTime) {
    return 0;
  }

  const parts = normalizedTime.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  if (parts.length === 2) {
    return (parts[0] * 60 * 60) + (parts[1] * 60);
  }

  return (parts[0] * 60 * 60) + (parts[1] * 60) + parts[2];
}

function formatDurationFromSeconds(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRaceDate(value) {
  const normalizedDate = normalizeDateOnlyValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return normalizedDate || "-";
  }

  const [year, month, day] = normalizedDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function formatGenderLabel(value) {
  const normalizedValue = normalizeHeader(value);

  if (normalizedValue === "fem") {
    return "Feminino";
  }

  if (normalizedValue === "mas") {
    return "Masculino";
  }

  return normalizeText(value) || "Sem gênero";
}

function parseDateToTime(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return 0;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(safeValue)) {
    const parsedIsoDate = new Date(safeValue);
    return Number.isNaN(parsedIsoDate.getTime()) ? 0 : parsedIsoDate.getTime();
  }

  const normalizedDate = normalizeDateOnlyValue(safeValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const [year, month, day] = normalizedDate.split("-").map(Number);
    return new Date(year, month - 1, day).getTime();
  }

  const parsedDate = new Date(safeValue);
  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
}

function isBetterPerformance(candidate, currentBest) {
  if (candidate.timeSeconds !== currentBest.timeSeconds) {
    return candidate.timeSeconds < currentBest.timeSeconds;
  }

  const raceDateDiff = parseDateToTime(candidate.raceDate) - parseDateToTime(currentBest.raceDate);
  if (raceDateDiff !== 0) {
    return raceDateDiff > 0;
  }

  const createdAtDiff = parseDateToTime(candidate.createdAt) - parseDateToTime(currentBest.createdAt);
  if (createdAtDiff !== 0) {
    return createdAtDiff > 0;
  }

  return normalizeHeader(candidate.raceName) < normalizeHeader(currentBest.raceName);
}

function sortHistoryEntries(entries) {
  return [...entries].sort((first, second) => {
    const raceDateDiff = parseDateToTime(second.raceDate) - parseDateToTime(first.raceDate);
    if (raceDateDiff !== 0) {
      return raceDateDiff;
    }

    const createdAtDiff = parseDateToTime(second.createdAt) - parseDateToTime(first.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    if (first.timeSeconds !== second.timeSeconds) {
      return first.timeSeconds - second.timeSeconds;
    }

    return first.raceName.localeCompare(second.raceName, "pt-BR", { sensitivity: "base" });
  });
}

function sortRankingEntries(first, second) {
  if (first.bestTimeSeconds !== second.bestTimeSeconds) {
    return first.bestTimeSeconds - second.bestTimeSeconds;
  }

  const raceDateDiff = parseDateToTime(second.bestRaceDate) - parseDateToTime(first.bestRaceDate);
  if (raceDateDiff !== 0) {
    return raceDateDiff;
  }

  return first.athlete.localeCompare(second.athlete, "pt-BR", { sensitivity: "base" });
}

function sortDistanceLabels(first, second) {
  const firstDistance = parseDistanceToKm(first);
  const secondDistance = parseDistanceToKm(second);

  if (firstDistance !== secondDistance) {
    return firstDistance - secondDistance;
  }

  return first.localeCompare(second, "pt-BR", { sensitivity: "base" });
}

function sortCategoryLabels(first, second) {
  const firstIndex = RP_CATEGORY_ORDER.findIndex((category) => normalizeHeader(category) === normalizeHeader(first));
  const secondIndex = RP_CATEGORY_ORDER.findIndex((category) => normalizeHeader(category) === normalizeHeader(second));

  if (firstIndex !== -1 || secondIndex !== -1) {
    if (firstIndex === -1) {
      return 1;
    }

    if (secondIndex === -1) {
      return -1;
    }

    return firstIndex - secondIndex;
  }

  return first.localeCompare(second, "pt-BR", { sensitivity: "base" });
}

function parseDistanceToKm(value) {
  const normalizedValue = normalizeDistanceLabel(value);
  const match = normalizedValue.match(/^(\d+(?:\.\d+)?)\s*km$/i);

  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function setStatus(text) {
  statusElement.textContent = text;
}

function isRpGoogleScriptConfigured() {
  return Boolean(RP_RANKING_GOOGLE_SCRIPT_URL) && !looksLikeSpreadsheetUrl(RP_RANKING_GOOGLE_SCRIPT_URL);
}

function looksLikeSpreadsheetUrl(value) {
  return /docs\.google\.com\/spreadsheets/i.test(String(value || ""));
}

async function safeReadJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    console.error("Não foi possível ler a resposta JSON do Momento RP:", error);
    return { ok: false, message: "A resposta do Momento RP não estava em JSON." };
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function createEmptyRankingData() {
  return {
    generalEntries: [],
    categoryEntries: [],
    categories: [],
    distances: [],
    totalRecords: 0,
    totalAthletes: 0
  };
}
