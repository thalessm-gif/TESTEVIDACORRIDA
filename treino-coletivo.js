const collectiveConfig = window.COLLECTIVE_TRAINING_CONFIG || {};
const collectiveSession = collectiveConfig.session || {};
const COLLECTIVE_ENABLED = collectiveConfig.enabled !== false;
const COLLECTIVE_GOOGLE_SCRIPT_URL = String(collectiveConfig.googleScriptUrl || "").trim();
const COLLECTIVE_GOOGLE_SHEETS_ONLY_MODE = collectiveConfig.googleSheetsOnlyMode !== false;
const COLLECTIVE_LIST_ACTION = String(collectiveConfig.listAction || "collective-training-list").trim();
const COLLECTIVE_RESOURCE = String(collectiveConfig.resource || "collectiveTraining").trim();
const COLLECTIVE_STORAGE_KEY = `collective-training-${getCollectiveSessionId()}`;
const collectiveSuggestedNames = Array.isArray(window.KIT_ATHLETE_NAMES) ? window.KIT_ATHLETE_NAMES : [];

const collectiveForm = document.getElementById("collective-form");
const collectiveFullNameInput = document.getElementById("collective-full-name");
const collectiveSuggestionList = document.getElementById("collective-athlete-suggestions");
const collectiveFormMessage = document.getElementById("collective-form-message");
const collectiveSubmitButton = document.getElementById("collective-submit-button");
const collectivePageTitle = document.getElementById("collective-page-title");
const collectivePageDescription = document.getElementById("collective-page-description");
const collectiveSessionDate = document.getElementById("collective-session-date");
const collectiveSessionDay = document.getElementById("collective-session-day");
const collectiveSessionTime = document.getElementById("collective-session-time");
const collectiveSessionDeadline = document.getElementById("collective-session-deadline");
const collectiveSessionLocation = document.getElementById("collective-session-location");
const collectiveSessionMinimum = document.getElementById("collective-session-minimum");
const collectiveStatusBanner = document.getElementById("collective-status-banner");
const collectiveStatusTitle = document.getElementById("collective-status-title");
const collectiveStatusText = document.getElementById("collective-status-text");
const collectiveTotalCount = document.getElementById("collective-total-count");
const collectiveNamePillList = document.getElementById("collective-name-pill-list");
const statusBox = document.getElementById("status-box");
const statusBoxTitle = document.getElementById("status-box-title");
const statusBoxText = document.getElementById("status-box-text");
const statusSpinner = document.getElementById("status-spinner");

let collectiveEntries = [];
let statusHideTimeoutId = null;

if (
  collectiveForm &&
  collectiveFullNameInput &&
  collectiveSuggestionList &&
  collectiveFormMessage &&
  collectiveSubmitButton &&
  collectivePageTitle &&
  collectivePageDescription &&
  collectiveSessionDate &&
  collectiveSessionDay &&
  collectiveSessionTime &&
  collectiveSessionDeadline &&
  collectiveSessionLocation &&
  collectiveSessionMinimum &&
  collectiveStatusBanner &&
  collectiveStatusTitle &&
  collectiveStatusText &&
  collectiveTotalCount &&
  collectiveNamePillList
) {
  initializeCollectiveTrainingPage();
}

function initializeCollectiveTrainingPage() {
  renderCollectiveSessionInfo();
  updateCollectiveSuggestions();
  attachCollectiveEventListeners();
  renderCollectivePage();

  if (!COLLECTIVE_ENABLED) {
    renderCollectiveUnavailableState();
    return;
  }

  if (!hasValidCollectiveSession()) {
    renderCollectiveUnavailableState("Revise a configuração do treino coletivo antes de abrir esta página.");
    return;
  }

  loadCollectiveEntries();

  window.setInterval(() => {
    renderCollectivePage();
    applyCollectiveFormAvailability();
  }, 60000);
}

function attachCollectiveEventListeners() {
  collectiveForm.addEventListener("submit", handleCollectiveSubmit);
}

function renderCollectiveSessionInfo() {
  const startDate = getCollectiveStartDate();
  const deadlineDate = getCollectiveDecisionDeadlineDate();
  const minimumParticipants = getCollectiveMinimumParticipants();

  collectivePageTitle.textContent = collectiveSession.title || "Treino Coletivo";
  collectivePageDescription.textContent =
    collectiveSession.description ||
    "Confirme seu nome e acompanhe rapidamente se a turma atingiu o mínimo necessário.";
  collectiveSessionDate.textContent = formatCollectiveShortDate(startDate);
  collectiveSessionDay.textContent = startDate
    ? formatCollectiveWeekday(startDate)
    : "Defina a data do treino no arquivo de configuração.";
  collectiveSessionTime.textContent = formatCollectiveTime(startDate);
  collectiveSessionLocation.textContent =
    collectiveSession.location || "Defina o local do treino no arquivo de configuração.";
  collectiveSessionDeadline.textContent = formatCollectiveDeadlineLabel(deadlineDate);
  collectiveSessionMinimum.textContent = `${minimumParticipants} atleta${minimumParticipants === 1 ? "" : "s"}`;
}

async function loadCollectiveEntries() {
  showCollectiveMessage("Carregando confirmações...");
  setCollectiveFormDisabled(true);
  showStatus({
    title: "Carregando confirmações...",
    text: "Aguarde enquanto buscamos os nomes mais recentes do treino coletivo.",
    busy: true
  });

  try {
    if (shouldUseCollectiveGoogleSheetsAsSingleSource()) {
      collectiveEntries = sortCollectiveEntries(
        await loadCollectiveEntriesFromGoogleSheets({ throwOnError: true })
      );
      clearCollectiveEntriesFromLocalStorage();
      renderCollectivePage();
      showCollectiveMessage(
        collectiveEntries.length
          ? "Confirmações carregadas com sucesso."
          : "Lista pronta para receber as primeiras confirmações."
      );
      hideStatus();
      return;
    }

    collectiveEntries = sortCollectiveEntries(loadCollectiveEntriesFromLocalStorage());
    renderCollectivePage();
    showCollectiveMessage(
      collectiveEntries.length
        ? "Confirmações locais carregadas."
        : "Lista pronta para receber as primeiras confirmações."
    );
    hideStatus();
  } catch (error) {
    console.error("Erro ao carregar o treino coletivo:", error);
    collectiveEntries = sortCollectiveEntries(loadCollectiveEntriesFromLocalStorage());
    renderCollectivePage();
    showCollectiveMessage("Não foi possível carregar a lista online agora.", true);
    showStatus({
      title: "Falha ao carregar confirmações",
      text: "Verifique a configuração do Apps Script e tente novamente.",
      tone: "error"
    });
  } finally {
    applyCollectiveFormAvailability();
  }
}

async function handleCollectiveSubmit(event) {
  event.preventDefault();

  if (isCollectiveFormClosed()) {
    showCollectiveMessage("As confirmações desta sessão já foram encerradas.", true);
    return;
  }

  const fullName = normalizeCollectiveText(collectiveFullNameInput.value);
  if (!fullName) {
    showCollectiveMessage("Digite o nome do atleta para confirmar a presença.", true);
    return;
  }

  const nextEntry = normalizeCollectiveEntry({
    id: createCollectiveEntryId(),
    sessionId: getCollectiveSessionId(),
    fullName,
    createdAt: new Date().toISOString()
  });

  if (!nextEntry) {
    showCollectiveMessage("Não foi possível preparar a confirmação.", true);
    return;
  }

  setCollectiveFormDisabled(true);
  showStatus({
    title: "Enviando confirmação...",
    text: "Aguarde enquanto atualizamos a lista do treino coletivo.",
    busy: true
  });

  try {
    if (isCollectiveGoogleScriptConfigured()) {
      const syncStatus = await syncCollectiveEntryWithGoogleSheets(nextEntry);

      if (syncStatus === "synced" || syncStatus === "queued") {
        const refreshedEntries = await refreshCollectiveEntriesFromGoogleSheets(nextEntry);

        if (refreshedEntries) {
          collectiveEntries = refreshedEntries;
          clearCollectiveEntriesFromLocalStorage();
          renderCollectivePage();
          collectiveForm.reset();
          showCollectiveMessage("Presença confirmada com sucesso.");
          showStatus({
            title: "Confirmação registrada",
            text: "A lista do treino coletivo foi atualizada.",
            tone: "success",
            hideAfterMs: 4000
          });
          applyCollectiveFormAvailability();
          return;
        }
      }

      if (COLLECTIVE_GOOGLE_SHEETS_ONLY_MODE) {
        showCollectiveMessage("Não foi possível confirmar a atualização da lista online agora.", true);
        showStatus({
          title: "Falha ao atualizar a lista",
          text: "O Apps Script não confirmou a gravação da presença.",
          tone: "error"
        });
        applyCollectiveFormAvailability();
        return;
      }
    }

    collectiveEntries = sortCollectiveEntries(upsertCollectiveEntry(collectiveEntries, nextEntry));
    saveCollectiveEntriesToLocalStorage(collectiveEntries);
    renderCollectivePage();
    collectiveForm.reset();
    showCollectiveMessage("Presença confirmada neste navegador.");
    showStatus({
      title: "Confirmação registrada",
      text: "A lista local foi atualizada com a nova presença.",
      tone: "success",
      hideAfterMs: 4000
    });
  } catch (error) {
    console.error("Erro ao confirmar o treino coletivo:", error);
    showCollectiveMessage("Não foi possível concluir a confirmação agora.", true);
    showStatus({
      title: "Falha ao confirmar presença",
      text: "Tivemos um problema ao registrar o nome. Tente novamente em alguns instantes.",
      tone: "error"
    });
  } finally {
    applyCollectiveFormAvailability();
  }
}

function renderCollectivePage() {
  const state = getCollectiveTrainingState();
  renderCollectiveStatus(state);
  renderCollectiveList(state);
  applyCollectiveFormAvailability();
}

function renderCollectiveUnavailableState(message) {
  collectiveEntries = [];
  collectivePageTitle.textContent = "Treino Coletivo";
  collectivePageDescription.textContent = "Nenhum treino coletivo está disponível no momento.";
  collectiveSessionDate.textContent = "-";
  collectiveSessionDay.textContent = "Abra uma nova sessão para exibir as informações aqui.";
  collectiveSessionTime.textContent = "-";
  collectiveSessionLocation.textContent = "-";
  collectiveSessionDeadline.textContent = "-";
  collectiveSessionMinimum.textContent = "-";
  collectiveStatusBanner.className = "collective-status-banner collective-status-banner-pending";
  collectiveStatusTitle.textContent = "Nenhum treino coletivo aberto";
  collectiveStatusText.textContent =
    message || "Quando um novo treino for liberado, o card volta para a primeira posição da home automaticamente.";
  collectiveTotalCount.textContent = "0 confirmados";
  collectiveNamePillList.innerHTML = `<p class="empty-state">Nenhum treino coletivo aberto no momento.</p>`;
  setCollectiveFormDisabled(true);
  collectiveSubmitButton.textContent = "Treino indisponível";
  showCollectiveMessage("Ative o treino no arquivo de configuração para liberar novas confirmações.", true);
}

function renderCollectiveStatus(state) {
  collectiveStatusBanner.className = `collective-status-banner ${state.bannerClass}`;
  collectiveStatusTitle.textContent = state.title;
  collectiveStatusText.textContent = state.text;
  collectiveTotalCount.textContent = `${collectiveEntries.length} confirmado${collectiveEntries.length === 1 ? "" : "s"}`;
}

function renderCollectiveList(state) {
  if (!collectiveEntries.length) {
    collectiveNamePillList.innerHTML = `<p class="empty-state">${state.emptyMessage}</p>`;
    return;
  }

  collectiveNamePillList.innerHTML = collectiveEntries
    .map((entry) => `<span class="collective-name-pill">${escapeHtml(entry.fullName)}</span>`)
    .join("");
}

function applyCollectiveFormAvailability() {
  setCollectiveFormDisabled(isCollectiveFormClosed());

  if (isCollectiveFormClosed()) {
    collectiveSubmitButton.textContent = COLLECTIVE_ENABLED ? "Confirmações encerradas" : "Treino indisponível";
    collectiveSubmitButton.title = COLLECTIVE_ENABLED
      ? "Esta sessão já passou do horário de corte."
      : "Ative a sessão no arquivo de configuração.";
    return;
  }

  collectiveSubmitButton.textContent = "Confirmar presença";
  collectiveSubmitButton.title = "";
}

function getCollectiveTrainingState() {
  if (!COLLECTIVE_ENABLED) {
    return {
      bannerClass: "collective-status-banner-pending",
      title: "Nenhum treino coletivo aberto",
      text: "Ative a sessão no arquivo de configuração para exibir o treino na home e liberar novas confirmações.",
      emptyMessage: "Nenhum treino coletivo aberto no momento."
    };
  }

  const minimumParticipants = getCollectiveMinimumParticipants();
  const participantCount = collectiveEntries.length;
  const deadlineDate = getCollectiveDecisionDeadlineDate();
  const now = new Date();
  const deadlineReached = deadlineDate ? now.getTime() >= deadlineDate.getTime() : false;
  const remainingParticipants = Math.max(minimumParticipants - participantCount, 0);
  const deadlineLabel = formatCollectiveDeadlineLabel(deadlineDate);

  if (deadlineReached && participantCount < minimumParticipants) {
    return {
      bannerClass: "collective-status-banner-cancelled",
      title: "TREINO COLETIVO CANCELADO",
      text: `Até ${deadlineLabel}, a lista ficou com ${participantCount} atleta${participantCount === 1 ? "" : "s"} confirmado${participantCount === 1 ? "" : "s"}.`,
      emptyMessage: "Nenhuma confirmação foi registrada antes do horário de corte desta sessão."
    };
  }

  if (deadlineReached) {
    return {
      bannerClass: "collective-status-banner-confirmed",
      title: "TREINO COLETIVO CONFIRMADO",
      text: `O mínimo de ${minimumParticipants} atleta${minimumParticipants === 1 ? "" : "s"} foi atingido dentro do prazo. A lista fechou com ${participantCount} confirmado${participantCount === 1 ? "" : "s"}.`,
      emptyMessage: "Nenhuma confirmação registrada."
    };
  }

  if (participantCount >= minimumParticipants) {
    return {
      bannerClass: "collective-status-banner-ready",
      title: "MÍNIMO ATINGIDO",
      text: `A turma já bateu o mínimo de ${minimumParticipants} atleta${minimumParticipants === 1 ? "" : "s"}. As confirmações continuam abertas até ${deadlineLabel}.`,
      emptyMessage: "Nenhuma confirmação registrada."
    };
  }

  return {
    bannerClass: "collective-status-banner-pending",
    title: "AGUARDANDO CONFIRMAÇÕES",
    text: `Há ${participantCount} atleta${participantCount === 1 ? "" : "s"} confirmado${participantCount === 1 ? "" : "s"} até agora. Faltam ${remainingParticipants} para manter o treino ativo até ${deadlineLabel}.`,
    emptyMessage: "Nenhuma confirmação registrada ainda."
  };
}

async function loadCollectiveEntriesFromGoogleSheets(options = {}) {
  const { throwOnError = false } = options;

  if (!isCollectiveGoogleScriptConfigured()) {
    return [];
  }

  try {
    const separator = COLLECTIVE_GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(
      `${COLLECTIVE_GOOGLE_SCRIPT_URL}${separator}action=${encodeURIComponent(COLLECTIVE_LIST_ACTION)}&sessionId=${encodeURIComponent(getCollectiveSessionId())}&ts=${Date.now()}`
    );

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.ok === false) {
      throw new Error(String(data.message || "A consulta do treino coletivo foi rejeitada."));
    }

    return Array.isArray(data.entries) ? data.entries.map(normalizeCollectiveEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao carregar o treino coletivo no Google Sheets:", error);
    if (throwOnError) {
      throw error;
    }
    return [];
  }
}

async function syncCollectiveEntryWithGoogleSheets(entry) {
  if (!isCollectiveGoogleScriptConfigured()) {
    return "disabled";
  }

  const payload = JSON.stringify({
    resource: COLLECTIVE_RESOURCE,
    session: buildCollectiveSessionPayload(),
    ...entry
  });

  try {
    const response = await fetch(COLLECTIVE_GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);

      if (data && data.ok === false) {
        throw new Error(String(data.message || "A confirmacao do treino coletivo foi rejeitada."));
      }

      return "synced";
    }
  } catch (error) {
    console.error("Erro ao enviar a confirmação do treino coletivo:", error);
  }

  try {
    await fetch(COLLECTIVE_GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: payload
    });

    return "queued";
  } catch (error) {
    console.error("Erro no envio simples do treino coletivo:", error);
    return "local_only";
  }
}

function buildCollectiveSessionPayload() {
  return {
    id: getCollectiveSessionId(),
    title: normalizeCollectiveText(collectiveSession.title || "Treino Coletivo"),
    startsAtIso: normalizeCollectiveSessionDateTime(collectiveSession.startsAtIso),
    decisionDeadlineIso: normalizeCollectiveSessionDateTime(collectiveSession.decisionDeadlineIso),
    location: normalizeCollectiveText(collectiveSession.location),
    minimumParticipants: getCollectiveMinimumParticipants()
  };
}

async function refreshCollectiveEntriesFromGoogleSheets(expectedEntry, options = {}) {
  const attempts = Number.isFinite(options.attempts) ? options.attempts : 6;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const remoteEntries = sortCollectiveEntries(
      await loadCollectiveEntriesFromGoogleSheets({ throwOnError: attempt === attempts - 1 })
    );

    if (!expectedEntry || containsCollectiveEntry(remoteEntries, expectedEntry)) {
      return remoteEntries;
    }

    if (attempt < attempts - 1) {
      await wait(delayMs);
    }
  }

  return null;
}

function loadCollectiveEntriesFromLocalStorage() {
  try {
    const rawEntries = localStorage.getItem(COLLECTIVE_STORAGE_KEY);
    if (!rawEntries) {
      return [];
    }

    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeCollectiveEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao carregar as confirmações locais:", error);
    return [];
  }
}

function saveCollectiveEntriesToLocalStorage(entries) {
  try {
    localStorage.setItem(
      COLLECTIVE_STORAGE_KEY,
      JSON.stringify(sortCollectiveEntries(entries.map(normalizeCollectiveEntry).filter(Boolean)))
    );
  } catch (error) {
    console.error("Erro ao salvar as confirmações locais:", error);
  }
}

function clearCollectiveEntriesFromLocalStorage() {
  try {
    localStorage.removeItem(COLLECTIVE_STORAGE_KEY);
  } catch (error) {
    console.error("Erro ao limpar as confirmações locais:", error);
  }
}

function upsertCollectiveEntry(entries, entry) {
  const nextEntries = [];
  const expectedKey = getCollectiveNameKey(entry.fullName);
  let replaced = false;

  entries.forEach((currentEntry) => {
    if (getCollectiveNameKey(currentEntry.fullName) === expectedKey) {
      if (!replaced) {
        nextEntries.push(entry);
        replaced = true;
      }
      return;
    }

    nextEntries.push(currentEntry);
  });

  if (!replaced) {
    nextEntries.push(entry);
  }

  return nextEntries;
}

function normalizeCollectiveEntry(entry) {
  if (!entry) {
    return null;
  }

  const normalizedEntry = {
    id: String(entry.id || createCollectiveEntryId()),
    sessionId: normalizeCollectiveText(entry.sessionId || getCollectiveSessionId()),
    fullName: normalizeCollectiveText(entry.fullName),
    createdAt: normalizeCollectiveDateTime(entry.createdAt)
  };

  if (
    !normalizedEntry.sessionId ||
    normalizedEntry.sessionId !== getCollectiveSessionId() ||
    !normalizedEntry.fullName
  ) {
    return null;
  }

  return normalizedEntry;
}

function sortCollectiveEntries(entries) {
  return [...entries].sort((first, second) =>
    first.fullName.localeCompare(second.fullName, "pt-BR", { sensitivity: "base" })
  );
}

function containsCollectiveEntry(entries, expectedEntry) {
  const expectedKey = getCollectiveNameKey(expectedEntry.fullName);

  return entries.some((entry) =>
    entry.id === expectedEntry.id || getCollectiveNameKey(entry.fullName) === expectedKey
  );
}

function updateCollectiveSuggestions() {
  const uniqueNames = new Map();

  collectiveSuggestedNames
    .map((name) => normalizeCollectiveText(name))
    .filter(Boolean)
    .forEach((name) => {
      const normalizedKey = name.toLocaleLowerCase("pt-BR");
      if (!uniqueNames.has(normalizedKey)) {
        uniqueNames.set(normalizedKey, name);
      }
    });

  collectiveSuggestionList.innerHTML = [...uniqueNames.values()]
    .sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }))
    .map((name) => `<option value="${escapeHtmlAttribute(name)}"></option>`)
    .join("");
}

function showCollectiveMessage(message, isError = false) {
  collectiveFormMessage.textContent = message;
  collectiveFormMessage.style.color = isError ? "#ffd0d0" : "#d8ffef";
}

function setCollectiveFormDisabled(disabled) {
  collectiveFullNameInput.disabled = disabled;
  collectiveSubmitButton.disabled = disabled;
}

function isCollectiveFormClosed() {
  if (!COLLECTIVE_ENABLED) {
    return true;
  }

  const state = getCollectiveTrainingState();
  return (
    state.bannerClass === "collective-status-banner-cancelled" ||
    state.bannerClass === "collective-status-banner-confirmed"
  );
}

function hasValidCollectiveSession() {
  return Boolean(getCollectiveSessionId()) && Boolean(getCollectiveStartDate()) && Boolean(getCollectiveDecisionDeadlineDate());
}

function getCollectiveSessionId() {
  if (collectiveSession.id) {
    return normalizeCollectiveText(collectiveSession.id);
  }

  return normalizeCollectiveText(collectiveSession.startsAtIso || "collective-session");
}

function getCollectiveMinimumParticipants() {
  const parsedMinimum = Number.parseInt(String(collectiveSession.minimumParticipants || "5"), 10);
  return Number.isFinite(parsedMinimum) && parsedMinimum > 0 ? parsedMinimum : 5;
}

function getCollectiveStartDate() {
  return parseCollectiveDate(collectiveSession.startsAtIso);
}

function getCollectiveDecisionDeadlineDate() {
  return parseCollectiveDate(collectiveSession.decisionDeadlineIso);
}

function parseCollectiveDate(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return null;
  }

  const parsedDate = new Date(safeValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatCollectiveShortDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Configure a data";
  }

  return value.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

function formatCollectiveTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Configure o horário";
  }

  return value.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCollectiveWeekday(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Defina a data do treino.";
  }

  return capitalizeCollectiveLabel(
    value.toLocaleDateString("pt-BR", {
      weekday: "long"
    })
  );
}

function formatCollectiveDeadlineLabel(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "Configure a data e hora";
  }

  return `${formatCollectiveWeekday(value)}, ${formatCollectiveShortDate(value)} às ${formatCollectiveTime(value)}`;
}

function capitalizeCollectiveLabel(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  return safeValue.charAt(0).toUpperCase() + safeValue.slice(1);
}

function normalizeCollectiveDateTime(value) {
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

function normalizeCollectiveSessionDateTime(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  return parseCollectiveDate(safeValue) ? safeValue : "";
}

function normalizeCollectiveText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getCollectiveNameKey(value) {
  return normalizeCollectiveText(value)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function createCollectiveEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `collective-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function showStatus(options = {}) {
  if (!statusBox || !statusBoxTitle || !statusBoxText || !statusSpinner) {
    return;
  }

  const {
    title = "",
    text = "",
    tone = "info",
    busy = false,
    hideAfterMs = 0
  } = options;

  clearStatusHideTimeout();
  statusBox.className = `status-box status-box-${tone}`;
  statusBoxTitle.textContent = title;
  statusBoxText.textContent = text;
  statusBoxText.hidden = !text;
  statusSpinner.classList.toggle("status-spinner-hidden", !busy);

  if (hideAfterMs > 0) {
    statusHideTimeoutId = window.setTimeout(() => {
      hideStatus();
    }, hideAfterMs);
  }
}

function hideStatus() {
  if (!statusBox || !statusSpinner || !statusBoxText) {
    return;
  }

  clearStatusHideTimeout();
  statusBox.className = "status-box status-box-hidden";
  statusSpinner.classList.remove("status-spinner-hidden");
  statusBoxText.hidden = false;
}

function clearStatusHideTimeout() {
  if (statusHideTimeoutId) {
    window.clearTimeout(statusHideTimeoutId);
    statusHideTimeoutId = null;
  }
}

function isCollectiveGoogleScriptConfigured() {
  return Boolean(COLLECTIVE_GOOGLE_SCRIPT_URL) && !looksLikeSpreadsheetUrl(COLLECTIVE_GOOGLE_SCRIPT_URL);
}

function shouldUseCollectiveGoogleSheetsAsSingleSource() {
  return COLLECTIVE_GOOGLE_SHEETS_ONLY_MODE && isCollectiveGoogleScriptConfigured();
}

function looksLikeSpreadsheetUrl(url) {
  return /docs\.google\.com\/spreadsheets/i.test(String(url || ""));
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
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
