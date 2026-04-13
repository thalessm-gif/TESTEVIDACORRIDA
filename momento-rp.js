const RP_STORAGE_KEY = "momento-rp-entries";
const RP_GOOGLE_SHEETS_ONLY_MODE = true;
const RP_GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec";
const RP_RESOURCE = "rp";
const RP_LIST_ACTION = "rp-list";
const RP_DISTANCES = [
  { value: "3km", label: "3 km", storedValue: "3 km" },
  { value: "5km", label: "5 km", storedValue: "5 km" },
  { value: "10km", label: "10 km", storedValue: "10 km" },
  { value: "21km", label: "21 km", storedValue: "21 km" },
  { value: "42km", label: "42 km", storedValue: "42 km" },
  { value: "other", label: "Outra", storedValue: "" }
];
const RP_GENDERS = [
  { value: "FEM", label: "Feminino" },
  { value: "MAS", label: "Masculino" }
];
const RP_CATEGORIES = [
  { value: "18-29", label: "18 a 29 anos" },
  { value: "30-39", label: "30 a 39 anos" },
  { value: "40-49", label: "40 a 49 anos" },
  { value: "50+", label: "50 anos ou mais" }
];
const RP_PODIUMS = [
  { value: "cat-1", label: "1o da categoria" },
  { value: "cat-2", label: "2o da categoria" },
  { value: "cat-3", label: "3o da categoria" },
  { value: "cat-4", label: "4o da categoria" },
  { value: "cat-5", label: "5o da categoria" },
  { value: "general-top5", label: "Top 5 Geral" },
  { value: "general-top10", label: "Top 10 Geral" },
  { value: "none", label: "Nenhum podio" }
];

const rpFormElement = document.getElementById("rp-form");
const athleteNameElement = document.getElementById("rp-athlete-name");
const raceNameElement = document.getElementById("rp-race-name");
const raceDateElement = document.getElementById("rp-race-date");
const timeElement = document.getElementById("rp-time");
const distanceOptionsElement = document.getElementById("rp-distance-options");
const customDistanceFieldElement = document.getElementById("rp-custom-distance-field");
const customDistanceElement = document.getElementById("rp-custom-distance");
const genderOptionsElement = document.getElementById("rp-gender-options");
const categoryOptionsElement = document.getElementById("rp-category-options");
const podiumOptionsElement = document.getElementById("rp-podium-options");
const formMessageElement = document.getElementById("rp-form-message");
const exportButtonElement = document.getElementById("rp-export-button");
const totalCountElement = document.getElementById("rp-total-count");
const raceCountElement = document.getElementById("rp-race-count");
const podiumCountElement = document.getElementById("rp-podium-count");
const statusElement = document.getElementById("rp-status");
const searchElement = document.getElementById("rp-search");
const entryListElement = document.getElementById("rp-entry-list");
const athleteSuggestionsElement = document.getElementById("rp-athlete-suggestions");
const preloadedAthleteNames = Array.isArray(window.KIT_ATHLETE_NAMES) ? window.KIT_ATHLETE_NAMES : [];

let rpEntries = [];
let selectedDistance = "";
let selectedGender = "";
let selectedCategory = "";
let selectedPodium = "";

renderChoiceGroup(distanceOptionsElement, RP_DISTANCES, selectedDistance, "distance");
renderChoiceGroup(genderOptionsElement, RP_GENDERS, selectedGender, "gender");
renderChoiceGroup(categoryOptionsElement, RP_CATEGORIES, selectedCategory, "category");
renderChoiceGroup(podiumOptionsElement, RP_PODIUMS, selectedPodium, "podium");
updateCustomDistanceVisibility();
updateAthleteSuggestions();
renderRpPage();
attachRpEventListeners();
initializeRpPage();

function attachRpEventListeners() {
  distanceOptionsElement.addEventListener("click", handleChoiceClick);
  genderOptionsElement.addEventListener("click", handleChoiceClick);
  categoryOptionsElement.addEventListener("click", handleChoiceClick);
  podiumOptionsElement.addEventListener("click", handleChoiceClick);

  rpFormElement.addEventListener("submit", handleRpSubmit);
  exportButtonElement.addEventListener("click", handleRpExport);
  searchElement.addEventListener("input", renderRpEntries);
}

async function initializeRpPage() {
  setRpFormDisabled(true);
  setRpStatus("Carregando registros");
  showRpMessage("Carregando registros do Momento RP...");

  try {
    if (shouldUseRpGoogleSheetsAsSingleSource()) {
      rpEntries = sortRpEntries(await loadRpEntriesFromGoogleSheets({ throwOnError: true }));
      clearRpEntriesFromLocalStorage();
      renderRpPage();
      showRpMessage(
        rpEntries.length
          ? "Registros carregados do Google Sheets."
          : "Sistema pronto para receber o primeiro Momento RP."
      );
      return;
    }

    let mergedEntries = loadRpEntriesFromLocalStorage();

    if (isRpGoogleScriptConfigured()) {
      const remoteEntries = await loadRpEntriesFromGoogleSheets();
      mergedEntries = mergeRpEntries(mergedEntries, remoteEntries);
      saveRpEntriesToLocalStorage(mergedEntries);
    }

    rpEntries = sortRpEntries(mergedEntries);
    renderRpPage();
    showRpMessage(
      rpEntries.length
        ? (
          isRpGoogleScriptConfigured()
            ? "Registros carregados com sucesso."
            : getRpLocalStorageHint()
        )
        : (
          isRpGoogleScriptConfigured()
            ? "Sistema pronto para receber o primeiro Momento RP."
            : getRpLocalStorageHint("Sistema pronto.")
        )
    );
  } catch (error) {
    console.error("Erro ao inicializar o Momento RP:", error);
    rpEntries = loadRpEntriesFromLocalStorage();
    renderRpPage();
    showRpMessage(
      "Nao foi possivel carregar a planilha do Momento RP agora. Os registros locais continuam disponiveis neste navegador.",
      true
    );
  } finally {
    setRpFormDisabled(false);
  }
}

function handleChoiceClick(event) {
  const button = event.target.closest("[data-choice-value]");
  if (!button) {
    return;
  }

  const group = button.dataset.choiceGroup;
  const value = button.dataset.choiceValue || "";

  if (group === "distance") {
    selectedDistance = value;
    renderChoiceGroup(distanceOptionsElement, RP_DISTANCES, selectedDistance, "distance");
    updateCustomDistanceVisibility();
    return;
  }

  if (group === "gender") {
    selectedGender = value;
    renderChoiceGroup(genderOptionsElement, RP_GENDERS, selectedGender, "gender");
    return;
  }

  if (group === "category") {
    selectedCategory = value;
    renderChoiceGroup(categoryOptionsElement, RP_CATEGORIES, selectedCategory, "category");
    return;
  }

  if (group === "podium") {
    selectedPodium = value;
    renderChoiceGroup(podiumOptionsElement, RP_PODIUMS, selectedPodium, "podium");
  }
}

async function handleRpSubmit(event) {
  event.preventDefault();

  if (isRpFormDisabled()) {
    return;
  }

  const normalizedTime = normalizeTimeValue(timeElement.value);
  const resolvedDistance = getResolvedDistanceLabel();
  const athleteName = normalizeText(athleteNameElement.value);
  const raceName = normalizeText(raceNameElement.value);
  const raceDate = normalizeDateOnlyValue(raceDateElement.value);
  const genderLabel = getLabelFromOptions(RP_GENDERS, selectedGender);
  const categoryLabel = getLabelFromOptions(RP_CATEGORIES, selectedCategory);
  const podiumLabel = getLabelFromOptions(RP_PODIUMS, selectedPodium);

  if (!athleteName || !raceName || !raceDate || !normalizedTime) {
    showRpMessage("Preencha nome, prova, data e tempo em um formato valido.", true);
    return;
  }

  if (!selectedDistance || !resolvedDistance) {
    showRpMessage("Selecione a distancia da prova.", true);
    return;
  }

  if (!genderLabel) {
    showRpMessage("Selecione o genero do atleta.", true);
    return;
  }

  if (!categoryLabel) {
    showRpMessage("Selecione a categoria representada.", true);
    return;
  }

  if (!podiumLabel) {
    showRpMessage("Informe se houve podium no evento.", true);
    return;
  }

  const newEntry = normalizeRpEntry({
    id: createRpEntryId(),
    athleteName,
    raceName,
    raceDate,
    time: normalizedTime,
    distance: resolvedDistance,
    gender: genderLabel,
    category: categoryLabel,
    podium: podiumLabel,
    createdAt: new Date().toISOString()
  });

  setRpFormDisabled(true);
  setRpStatus("Enviando registro");

  try {
    if (shouldUseRpGoogleSheetsAsSingleSource()) {
      const syncStatus = await syncRpEntryWithGoogleSheets(newEntry);

      if (syncStatus === "synced" || syncStatus === "queued") {
        const refreshedEntries = await refreshRpEntriesFromGoogleSheets(newEntry);

        if (refreshedEntries) {
          rpEntries = refreshedEntries;
          clearRpEntriesFromLocalStorage();
          renderRpPage();
          resetRpFormAfterSubmit();
          showRpMessage("Momento RP registrado com sucesso.");
          return;
        }
      }

      rpEntries = sortRpEntries([newEntry, ...rpEntries]);
      saveRpEntriesToLocalStorage(rpEntries);
      renderRpPage();
      resetRpFormAfterSubmit();
      showRpMessage(
        getRpSubmitMessage(syncStatus),
        syncStatus === "rejected" || syncStatus === "local_only"
      );
      return;
    }

    rpEntries = sortRpEntries([newEntry, ...rpEntries]);
    saveRpEntriesToLocalStorage(rpEntries);
    renderRpPage();

    const syncStatus = await syncRpEntryWithGoogleSheets(newEntry);

    if (syncStatus === "synced" || syncStatus === "queued") {
      const refreshedEntries = await refreshRpEntriesFromGoogleSheets(newEntry);

      if (refreshedEntries) {
        rpEntries = sortRpEntries(mergeRpEntries(rpEntries, refreshedEntries));
        saveRpEntriesToLocalStorage(rpEntries);
        renderRpPage();
      }
    }

    if (syncStatus === "synced" || syncStatus === "queued" || syncStatus === "disabled" || syncStatus === "local_only") {
      resetRpFormAfterSubmit();
      showRpMessage(getRpSubmitMessage(syncStatus));
      return;
    }

    showRpMessage(getRpSubmitMessage(syncStatus), true);
  } catch (error) {
    console.error("Erro ao registrar Momento RP:", error);
    showRpMessage("Nao foi possivel concluir o envio agora.", true);
  } finally {
    setRpFormDisabled(false);
  }
}

function handleRpExport() {
  if (!rpEntries.length) {
    showRpMessage("Ainda nao ha registros para exportar.", true);
    return;
  }

  const csvRows = [
    ["Nome do atleta", "Prova", "Data da prova", "Tempo", "Distancia", "Genero", "Categoria", "Podio"],
    ...sortRpEntries([...rpEntries]).map((entry) => [
      entry.athleteName,
      entry.raceName,
      entry.raceDate,
      entry.time,
      entry.distance,
      entry.gender,
      entry.category,
      entry.podium
    ])
  ];

  const csvContent = csvRows
    .map((row) => row.map(escapeCsvValue).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);

  link.href = downloadUrl;
  link.download = `momento-rp-${today}.csv`;
  link.click();

  URL.revokeObjectURL(downloadUrl);
  showRpMessage("Arquivo CSV exportado com sucesso.");
}

async function loadRpEntriesFromGoogleSheets(options = {}) {
  const { throwOnError = false } = options;

  if (!isRpGoogleScriptConfigured()) {
    return [];
  }

  try {
    const separator = RP_GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(`${RP_GOOGLE_SCRIPT_URL}${separator}action=${RP_LIST_ACTION}&ts=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.ok === false) {
      throw new Error(String(data.message || "A consulta do Momento RP foi rejeitada."));
    }

    return Array.isArray(data.entries) ? data.entries.map(normalizeRpEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao carregar dados do Momento RP no Google Sheets:", error);
    if (throwOnError) {
      throw error;
    }
    return [];
  }
}

async function syncRpEntryWithGoogleSheets(entry) {
  if (!isRpGoogleScriptConfigured()) {
    return "disabled";
  }

  const payload = JSON.stringify({
    resource: RP_RESOURCE,
    ...normalizeRpEntry(entry)
  });

  try {
    const response = await fetch(RP_GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    if (response.ok) {
      const data = await safeReadJson(response);

      if (!data || data.ok !== false) {
        return "synced";
      }

      return "rejected";
    }
  } catch (error) {
    console.error("Erro ao enviar Momento RP para o Google Sheets:", error);
  }

  try {
    await fetch(RP_GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    return "queued";
  } catch (error) {
    console.error("Erro no envio simples do Momento RP:", error);
    return "local_only";
  }
}

async function refreshRpEntriesFromGoogleSheets(expectedEntry, options = {}) {
  const {
    attempts = 8,
    delayMs = 700
  } = options;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remoteEntries = sortRpEntries(
      await loadRpEntriesFromGoogleSheets({ throwOnError: attempt === attempts - 1 })
    );

    if (!expectedEntry || containsRpEntry(remoteEntries, expectedEntry)) {
      return remoteEntries;
    }

    if (attempt < attempts - 1) {
      await wait(delayMs);
    }
  }

  return null;
}

function renderRpPage() {
  renderRpSummary();
  renderRpEntries();
}

function renderRpSummary() {
  totalCountElement.textContent = String(rpEntries.length);
  raceCountElement.textContent = String(getUniqueRaceCount(rpEntries));
  podiumCountElement.textContent = String(rpEntries.filter((entry) => normalizeText(entry.podium).toLowerCase() !== "nenhum podio").length);

  setRpStatus(
    rpEntries.length
      ? `${rpEntries.length} registro${rpEntries.length === 1 ? "" : "s"}`
      : "Pronto para registrar"
  );
}

function renderRpEntries() {
  const filteredEntries = filterRpEntries(searchElement.value);

  if (!filteredEntries.length) {
    entryListElement.innerHTML = `
      <article class="rp-empty-card">
        <p class="empty-state">${rpEntries.length ? "Nenhum resultado encontrado para a busca atual." : "Nenhum resultado registrado ainda. Preencha o formulario para criar o primeiro Momento RP."}</p>
      </article>
    `;
    return;
  }

  entryListElement.innerHTML = filteredEntries
    .map(
      (entry) => `
        <article class="rp-entry-card">
          <div class="rp-entry-card-top">
            <div class="rp-entry-heading">
              <p class="rp-entry-athlete">${escapeHtml(entry.athleteName)}</p>
              <h3>${escapeHtml(entry.raceName)}</h3>
            </div>
            <div class="rp-entry-time-block">
              <span class="rp-entry-time-label">Tempo</span>
              <strong class="rp-entry-time">${escapeHtml(entry.time)}</strong>
            </div>
          </div>

          <div class="rp-meta-grid">
            <div class="rp-meta-item">
              <span class="rp-meta-label">Data</span>
              <strong>${escapeHtml(formatRaceDate(entry.raceDate))}</strong>
            </div>
            <div class="rp-meta-item">
              <span class="rp-meta-label">Distancia</span>
              <strong>${escapeHtml(entry.distance)}</strong>
            </div>
            <div class="rp-meta-item">
              <span class="rp-meta-label">Genero</span>
              <strong>${escapeHtml(entry.gender)}</strong>
            </div>
            <div class="rp-meta-item">
              <span class="rp-meta-label">Categoria</span>
              <strong>${escapeHtml(entry.category)}</strong>
            </div>
            <div class="rp-meta-item">
              <span class="rp-meta-label">Resultado</span>
              <strong class="rp-podium-pill${normalizeText(entry.podium).toLowerCase() === "nenhum podio" ? " rp-podium-pill-muted" : ""}">${escapeHtml(entry.podium)}</strong>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderChoiceGroup(container, options, selectedValue, groupName) {
  container.innerHTML = options
    .map((option) => {
      const isActive = option.value === selectedValue;
      const activeClass = isActive ? " toggle-button-active" : "";

      return `
        <button
          type="button"
          class="toggle-button ranking-category-button${activeClass}"
          data-choice-group="${escapeHtmlAttribute(groupName)}"
          data-choice-value="${escapeHtmlAttribute(option.value)}"
          aria-pressed="${isActive ? "true" : "false"}"
        >
          ${escapeHtml(option.label)}
        </button>
      `;
    })
    .join("");
}

function updateCustomDistanceVisibility() {
  const shouldShow = selectedDistance === "other";
  customDistanceFieldElement.classList.toggle("rp-aux-field-hidden", !shouldShow);
  customDistanceElement.toggleAttribute("required", shouldShow);

  if (!shouldShow) {
    customDistanceElement.value = "";
  }
}

function updateAthleteSuggestions() {
  const uniqueNames = [...new Set(
    preloadedAthleteNames
      .map((name) => normalizeText(name))
      .filter(Boolean)
  )].sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }));

  athleteSuggestionsElement.innerHTML = uniqueNames
    .map((name) => `<option value="${escapeHtmlAttribute(name)}"></option>`)
    .join("");
}

function getResolvedDistanceLabel() {
  if (selectedDistance === "other") {
    return normalizeText(customDistanceElement.value);
  }

  const selectedOption = RP_DISTANCES.find((option) => option.value === selectedDistance);
  return selectedOption ? selectedOption.storedValue : "";
}

function getLabelFromOptions(options, value) {
  const option = options.find((item) => item.value === value);
  return option ? option.label : "";
}

function filterRpEntries(searchValue) {
  const normalizedSearch = normalizeText(searchValue).toLowerCase();
  if (!normalizedSearch) {
    return sortRpEntries([...rpEntries]);
  }

  return sortRpEntries(
    rpEntries.filter((entry) => {
      const searchable = [
        entry.athleteName,
        entry.raceName,
        entry.distance,
        entry.gender,
        entry.category,
        entry.podium
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    })
  );
}

function getUniqueRaceCount(entries) {
  return new Set(entries.map((entry) => `${entry.raceName}|${entry.raceDate}`)).size;
}

function loadRpEntriesFromLocalStorage() {
  try {
    const rawEntries = localStorage.getItem(RP_STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeRpEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao carregar os registros locais do Momento RP:", error);
    return [];
  }
}

function saveRpEntriesToLocalStorage(entries) {
  localStorage.setItem(RP_STORAGE_KEY, JSON.stringify(sortRpEntries(entries.map(normalizeRpEntry).filter(Boolean))));
}

function clearRpEntriesFromLocalStorage() {
  try {
    localStorage.removeItem(RP_STORAGE_KEY);
  } catch (error) {
    console.error("Erro ao limpar os registros locais do Momento RP:", error);
  }
}

function mergeRpEntries(...lists) {
  const mergedMap = new Map();

  lists
    .flat()
    .filter(Boolean)
    .map(normalizeRpEntry)
    .filter(Boolean)
    .forEach((entry) => {
      const key = entry.id || createRpEntryFingerprint(entry);
      mergedMap.set(key, entry);
    });

  return [...mergedMap.values()];
}

function normalizeRpEntry(entry) {
  if (!entry) {
    return null;
  }

  const normalizedEntry = {
    id: String(entry.id || createRpEntryId()),
    athleteName: normalizeText(entry.athleteName),
    raceName: normalizeText(entry.raceName),
    raceDate: normalizeDateOnlyValue(entry.raceDate),
    time: normalizeTimeValue(entry.time) || normalizeText(entry.time),
    distance: normalizeDistanceLabel(entry.distance),
    gender: normalizeLegacyChoiceLabel(entry.gender, RP_GENDERS),
    category: normalizeLegacyChoiceLabel(entry.category, RP_CATEGORIES),
    podium: normalizeLegacyChoiceLabel(entry.podium, RP_PODIUMS),
    createdAt: normalizeDateTimeValue(entry.createdAt)
  };

  if (!normalizedEntry.athleteName || !normalizedEntry.raceName || !normalizedEntry.raceDate) {
    return null;
  }

  return normalizedEntry;
}

function normalizeDistanceLabel(value) {
  const safeValue = normalizeText(value);
  if (!safeValue) {
    return "";
  }

  const knownOption = RP_DISTANCES.find((option) =>
    option.value === safeValue || option.storedValue === safeValue
  );

  if (knownOption) {
    return knownOption.storedValue || safeValue;
  }

  if (/^\d+\s*km$/i.test(safeValue)) {
    return safeValue.replace(/\s+/g, " ").replace(/km/i, "km").replace(/^(\d+)km$/i, "$1 km");
  }

  return safeValue;
}

function normalizeLegacyChoiceLabel(value, options) {
  const safeValue = normalizeText(value);
  if (!safeValue) {
    return "";
  }

  const normalizedKey = safeValue.toLocaleLowerCase("pt-BR");
  const option = options.find((item) =>
    item.value.toLocaleLowerCase("pt-BR") === normalizedKey ||
    item.label.toLocaleLowerCase("pt-BR") === normalizedKey
  );

  return option ? option.label : safeValue;
}

function sortRpEntries(entries) {
  return [...entries].sort((first, second) => {
    const raceDateDiff = parseDateToTime(second.raceDate) - parseDateToTime(first.raceDate);
    if (raceDateDiff !== 0) {
      return raceDateDiff;
    }

    const createdAtDiff = parseDateToTime(second.createdAt) - parseDateToTime(first.createdAt);
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return first.athleteName.localeCompare(second.athleteName, "pt-BR", { sensitivity: "base" });
  });
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

function normalizeDateOnlyValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
    return safeValue;
  }

  const slashMatch = safeValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoMatch = safeValue.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const parsedDate = new Date(safeValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return safeValue;
  }

  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, "0"),
    String(parsedDate.getDate()).padStart(2, "0")
  ].join("-");
}

function normalizeDateTimeValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return new Date().toISOString();
  }

  const parsedDate = new Date(safeValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  return parsedDate.toISOString();
}

function normalizeTimeValue(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(safeValue)) {
    return "";
  }

  const parts = safeValue.split(":");
  if (parts.length === 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }

  return `${parts[0].padStart(2, "0")}:${parts[1]}:${parts[2]}`;
}

function formatRaceDate(value) {
  const normalizedDate = normalizeDateOnlyValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return normalizedDate || "-";
  }

  const [year, month, day] = normalizedDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function createRpEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `rp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createRpEntryFingerprint(entry) {
  return [
    entry.athleteName || "",
    entry.raceName || "",
    entry.raceDate || "",
    entry.time || "",
    entry.distance || "",
    entry.gender || "",
    entry.category || "",
    entry.podium || "",
    entry.createdAt || ""
  ].join("|");
}

function containsRpEntry(list, expectedEntry) {
  const expectedFingerprint = createRpEntryFingerprint(expectedEntry);

  return list.some((entry) =>
    entry.id === expectedEntry.id || createRpEntryFingerprint(entry) === expectedFingerprint
  );
}

function resetRpFormAfterSubmit() {
  rpFormElement.reset();
  selectedDistance = "";
  selectedGender = "";
  selectedCategory = "";
  selectedPodium = "";
  renderChoiceGroup(distanceOptionsElement, RP_DISTANCES, selectedDistance, "distance");
  renderChoiceGroup(genderOptionsElement, RP_GENDERS, selectedGender, "gender");
  renderChoiceGroup(categoryOptionsElement, RP_CATEGORIES, selectedCategory, "category");
  renderChoiceGroup(podiumOptionsElement, RP_PODIUMS, selectedPodium, "podium");
  updateCustomDistanceVisibility();
  athleteNameElement.focus();
}

function setRpFormDisabled(disabled) {
  [
    athleteNameElement,
    raceNameElement,
    raceDateElement,
    timeElement,
    customDistanceElement,
    exportButtonElement
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });

  distanceOptionsElement.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });

  genderOptionsElement.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });

  categoryOptionsElement.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });

  podiumOptionsElement.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });

  const submitButton = rpFormElement.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = disabled;
  }
}

function isRpFormDisabled() {
  const submitButton = rpFormElement.querySelector('button[type="submit"]');
  return Boolean(submitButton && submitButton.disabled);
}

function setRpStatus(text) {
  statusElement.textContent = text;
}

function showRpMessage(message, isError = false) {
  formMessageElement.textContent = message;
  formMessageElement.style.color = isError ? "#ffd0d0" : "#d8ffef";
}

function getRpSubmitMessage(syncStatus, strictRemoteMode = false) {
  if (syncStatus === "synced") {
    return "Momento RP salvo e enviado para o Google Sheets.";
  }

  if (syncStatus === "queued") {
    return strictRemoteMode
      ? "O envio foi aceito, mas a planilha ainda nao confirmou a atualizacao. Tente recarregar em alguns instantes."
      : "Momento RP enviado. A planilha pode levar alguns instantes para refletir a atualizacao.";
  }

  if (syncStatus === "local_only") {
    return strictRemoteMode
      ? "Nao foi possivel confirmar a atualizacao da planilha agora."
      : "Momento RP salvo neste navegador, mas nao foi possivel atualizar a planilha agora.";
  }

  if (syncStatus === "disabled") {
    return getRpLocalStorageHint("Momento RP salvo neste navegador.");
  }

  if (syncStatus === "rejected") {
    return "O Apps Script atual ainda nao esta pronto para o Momento RP. Atualize o arquivo google-apps-script/Code.gs e publique novamente.";
  }

  if (looksLikeSpreadsheetUrl(RP_GOOGLE_SCRIPT_URL)) {
    return "A URL informada e da planilha, nao do Apps Script publicado. Use o link do tipo script.google.com/macros/s/.../exec.";
  }

  return strictRemoteMode
    ? "Nao foi possivel confirmar o registro na planilha agora."
    : "Nao foi possivel concluir o envio do Momento RP agora.";
}

function getRpLocalStorageHint(prefix) {
  const baseMessage = window.location.protocol === "file:"
    ? "Enquanto o Apps Script nao estiver ativo, os registros ficam apenas neste navegador."
    : "Os registros estao guardados neste navegador ate a planilha estar conectada.";

  return prefix ? `${prefix} ${baseMessage}` : baseMessage;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (error) {
    console.error("Nao foi possivel ler a resposta JSON do Momento RP:", error);
    return null;
  }
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function escapeCsvValue(value) {
  const safeValue = String(value ?? "");
  if (!/[;"\n]/.test(safeValue)) {
    return safeValue;
  }

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

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function isRpGoogleScriptConfigured() {
  return Boolean(RP_GOOGLE_SCRIPT_URL) && !looksLikeSpreadsheetUrl(RP_GOOGLE_SCRIPT_URL);
}

function looksLikeSpreadsheetUrl(url) {
  return /docs\.google\.com\/spreadsheets/i.test(String(url || ""));
}

function shouldUseRpGoogleSheetsAsSingleSource() {
  return RP_GOOGLE_SHEETS_ONLY_MODE && isRpGoogleScriptConfigured();
}
