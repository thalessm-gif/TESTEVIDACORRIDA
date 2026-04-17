const RACE_CALENDAR_ENTRIES = Array.isArray(window.RACE_CALENDAR_ENTRIES)
  ? window.RACE_CALENDAR_ENTRIES
  : [];

const calendarSystemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const calendarFeatureConfig = calendarSystemConfig.raceCalendar || {};
const CALENDAR_GOOGLE_SCRIPT_URL = String(
  calendarFeatureConfig.googleScriptUrl ||
    (calendarSystemConfig.googleAppsScript && calendarSystemConfig.googleAppsScript.url) ||
    ""
).trim();
const CALENDAR_INTEREST_LIST_ACTION = String(
  calendarFeatureConfig.listAction || "calendar-race-interest-summary-list"
).trim();
const CALENDAR_INTEREST_RESOURCE = String(
  calendarFeatureConfig.resource || "calendarRaceInterest"
).trim();
const CALENDAR_SUGGESTED_NAMES = Array.isArray(window.KIT_ATHLETE_NAMES)
  ? window.KIT_ATHLETE_NAMES
  : [];

const statusElement = document.getElementById("calendar-status");
const raceListElement = document.getElementById("calendar-race-list");
const statusBox = document.getElementById("status-box");
const statusBoxTitle = document.getElementById("status-box-title");
const statusBoxText = document.getElementById("status-box-text");
const statusSpinner = document.getElementById("status-spinner");
const calendarInterestModal = document.getElementById("calendar-interest-modal");
const calendarInterestCloseButton = document.getElementById("calendar-interest-close");
const calendarInterestForm = document.getElementById("calendar-interest-form");
const calendarInterestRaceLabel = document.getElementById("calendar-interest-modal-race");
const calendarInterestModalChips = document.getElementById("calendar-interest-modal-chips");
const calendarInterestAthleteNameInput = document.getElementById("calendar-interest-athlete-name");
const calendarInterestDistanceInput = document.getElementById("calendar-interest-distance");
const calendarInterestAthleteSuggestions = document.getElementById("calendar-interest-athlete-suggestions");
const calendarInterestDistanceSuggestions = document.getElementById("calendar-interest-distance-suggestions");
const calendarInterestFormMessage = document.getElementById("calendar-interest-form-message");
const calendarInterestSubmitButton = document.getElementById("calendar-interest-submit");
const calendarInterestTypeButtons = Array.from(
  document.querySelectorAll("[data-calendar-response-type]")
);

let calendarEntries = [];
let calendarRaceSummaryById = new Map();
let calendarSelectedRaceId = "";
let calendarSelectedResponseType = "interested";
let statusHideTimeoutId = null;
let calendarLastFocusedElement = null;

if (raceListElement && statusElement) {
  void initializeCalendarPage();
}

async function initializeCalendarPage() {
  calendarEntries = normalizeEntries(RACE_CALENDAR_ENTRIES);
  updateAthleteSuggestions();
  attachCalendarEventListeners();
  renderRaceList(calendarEntries);
  updateCalendarStatus();

  if (!calendarEntries.length) {
    return;
  }

  if (!isCalendarGoogleScriptConfigured()) {
    showStatus({
      title: "Participa\u00e7\u00e3o offline",
      text: "Configure o Apps Script para salvar interessados e inscritos por prova.",
      tone: "error",
      hideAfterMs: 4500
    });
    return;
  }

  showStatus({
    title: "Carregando respostas...",
    text: "Aguarde enquanto buscamos interessados e inscritos das provas.",
    busy: true
  });

  try {
    const summaryEntries = await fetchCalendarRaceSummary({ throwOnError: true });
    applyCalendarSummary(summaryEntries);
    renderRaceList(calendarEntries);
    updateCalendarStatus();
    hideStatus();
  } catch (error) {
    console.error("Erro ao carregar o resumo das provas:", error);
    showStatus({
      title: "Falha ao carregar respostas",
      text: "N\u00e3o foi poss\u00edvel atualizar os totais agora. O calend\u00e1rio continua dispon\u00edvel.",
      tone: "error",
      hideAfterMs: 5000
    });
  }
}

function attachCalendarEventListeners() {
  raceListElement.addEventListener("click", handleCalendarRaceListClick);

  if (calendarInterestForm) {
    calendarInterestForm.addEventListener("submit", handleCalendarInterestSubmit);
  }

  calendarInterestTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedResponseType(String(button.dataset.calendarResponseType || "interested"));
    });
  });

  if (calendarInterestModal) {
    calendarInterestModal.addEventListener("click", (event) => {
      const closeTrigger = event.target.closest("[data-calendar-modal-close]");
      if (closeTrigger) {
        closeCalendarInterestModal();
      }
    });
  }

  if (calendarInterestCloseButton) {
    calendarInterestCloseButton.addEventListener("click", () => {
      closeCalendarInterestModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isCalendarInterestModalOpen()) {
      closeCalendarInterestModal();
    }
  });
}

function normalizeEntries(entries) {
  return [...entries]
    .filter(Boolean)
    .map((entry, index) => {
      const normalizedDate = normalizeCalendarDateValue(entry.date);

      return {
        id: buildCalendarRaceId(entry, index),
        title: normalizeCalendarText(entry.title),
        date: normalizedDate,
        time: normalizeCalendarTime(entry.time),
        location: normalizeCalendarText(entry.location),
        distances: normalizeCalendarDistances(entry.distances),
        circuito: normalizeCalendarText(entry.circuito).toLowerCase(),
        signupUrl: normalizeCalendarUrl(entry.signupUrl),
        signupLabel: normalizeCalendarText(entry.signupLabel),
        notes: normalizeCalendarText(entry.notes),
        isCircuit: ["sim", "true", "1", "yes"].includes(normalizeCalendarText(entry.circuito).toLowerCase()),
        isFinished: isCalendarEventFinished(normalizedDate)
      };
    })
    .filter((entry) => entry.title)
    .sort((first, second) => {
      const firstTime = parseDateValue(first.date);
      const secondTime = parseDateValue(second.date);
      return firstTime - secondTime;
    });
}

function normalizeCalendarDistances(distances) {
  if (!Array.isArray(distances)) {
    return [];
  }

  return distances
    .map((distance) => normalizeCalendarText(distance))
    .filter(Boolean)
    .filter((distance, index, list) => list.indexOf(distance) === index);
}

function renderRaceList(entries) {
  if (!raceListElement) {
    return;
  }

  if (!entries.length) {
    raceListElement.innerHTML = `
      <article class="calendar-empty-card">
        <p class="empty-state">Nenhuma prova cadastrada ainda. Atualize o arquivo <strong>00-EDITAR-AQUI/05-calendario-provas.js</strong> para alimentar esta agenda.</p>
      </article>
    `;
    return;
  }

  raceListElement.innerHTML = groupEntriesByMonth(entries)
    .map((group) => renderMonthSection(group))
    .join("");
}

function groupEntriesByMonth(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const monthKey = getMonthKey(entry.date);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, {
        key: monthKey,
        label: getMonthLabel(entry.date),
        entries: []
      });
    }

    groups.get(monthKey).entries.push(entry);
  });

  return [...groups.values()];
}

function renderMonthSection(group) {
  return `
    <section class="calendar-month-section">
      <div class="calendar-month-header">
        <div>
          <p class="calendar-month-name">${escapeHtml(group.label)}</p>
        </div>
        <span class="calendar-month-count">${group.entries.length} prova${group.entries.length === 1 ? "" : "s"}</span>
      </div>

      <div class="calendar-month-races">
        ${group.entries.map((entry) => renderRaceCard(entry)).join("")}
      </div>
    </section>
  `;
}

function renderRaceCard(entry) {
  const summary = getCalendarRaceSummary(entry.id);
  const signupMarkup = buildCalendarSignupMarkup(entry);
  const responseButtonsMarkup = entry.isFinished
    ? ""
    : `
        <button
          type="button"
          class="secondary-button calendar-race-response-button"
          data-calendar-response="interested"
          data-race-id="${escapeHtmlAttribute(entry.id)}"
        >
          Tenho interesse
        </button>

        <button
          type="button"
          class="secondary-button calendar-race-response-button calendar-race-response-button-strong"
          data-calendar-response="registered"
          data-race-id="${escapeHtmlAttribute(entry.id)}"
        >
          J\u00e1 me inscrevi
        </button>
      `;

  const badges = [];

  if (entry.isCircuit) {
    badges.push('<span class="calendar-race-badge">Circuito Riograndino</span>');
  }

  if (entry.isFinished) {
    badges.push('<span class="calendar-race-badge calendar-race-badge-finished">Evento finalizado</span>');
  }

  return `
    <article class="calendar-race-card${entry.isFinished ? " calendar-race-card-finished" : ""}">
      <div class="calendar-race-card-top">
        <div class="calendar-race-headline">
          ${badges.join("")}
          <div class="calendar-race-title-row">
            <h3>${escapeHtml(entry.title)}</h3>
          </div>
          <p>${escapeHtml(entry.location || "Local a confirmar")}</p>
        </div>
      </div>

      <div class="calendar-race-summary">
        <div class="calendar-race-meta-item">
          <span class="calendar-race-meta-label">Data</span>
          <strong>${escapeHtml(formatDate(entry.date))}</strong>
        </div>

        <div class="calendar-race-meta-item">
          <span class="calendar-race-meta-label">Hor\u00e1rio</span>
          <strong>${escapeHtml(entry.time || "A confirmar")}</strong>
        </div>

        <div class="calendar-race-meta-item calendar-race-meta-item-distances">
          <span class="calendar-race-meta-label">Dist\u00e2ncias</span>
          <div class="calendar-distance-list">
            ${entry.distances.length
              ? entry.distances.map((distance) => `<span class="calendar-distance-chip">${escapeHtml(distance)}</span>`).join("")
              : '<span class="calendar-distance-chip">Em defini\u00e7\u00e3o</span>'}
          </div>
        </div>

        <div class="calendar-race-meta-item">
          <span class="calendar-race-meta-label">Participa\u00e7\u00e3o</span>
          <div class="calendar-race-chip-list">
            ${buildCalendarInterestChipsMarkup(summary)}
          </div>
        </div>
      </div>

      ${entry.notes ? `<p class="calendar-race-notes">${escapeHtml(entry.notes)}</p>` : ""}

      <div class="calendar-race-actions">
        ${signupMarkup}
        ${responseButtonsMarkup}
      </div>
    </article>
  `;
}

function buildCalendarSignupMarkup(entry) {
  if (entry.isFinished) {
    return '<span class="calendar-race-link calendar-race-link-disabled calendar-race-link-finished" aria-disabled="true">Evento finalizado</span>';
  }

  if (entry.signupUrl) {
    return `<a href="${escapeHtmlAttribute(entry.signupUrl)}" class="calendar-race-link" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.signupLabel || "Link inscri\u00e7\u00e3o")}</a>`;
  }

  return `<span class="calendar-race-link calendar-race-link-disabled" aria-disabled="true">${escapeHtml(entry.signupLabel || "Link em breve")}</span>`;
}

function buildCalendarInterestChipsMarkup(summary) {
  return `
    <span class="calendar-interest-chip">
      <strong>${summary.interestedCount}</strong>
      interessado${summary.interestedCount === 1 ? "" : "s"}
    </span>
    <span class="calendar-interest-chip calendar-interest-chip-strong">
      <strong>${summary.registeredCount}</strong>
      inscrito${summary.registeredCount === 1 ? "" : "s"}
    </span>
  `;
}

function handleCalendarRaceListClick(event) {
  const actionButton = event.target.closest("[data-calendar-response]");
  if (!actionButton) {
    return;
  }

  const raceId = String(actionButton.dataset.raceId || "").trim();
  const responseType = String(actionButton.dataset.calendarResponse || "interested").trim();

  if (!raceId) {
    return;
  }

  const entry = getCalendarEntryById(raceId);
  if (!entry || entry.isFinished) {
    return;
  }

  calendarLastFocusedElement = actionButton;
  openCalendarInterestModal(raceId, responseType);
}

function openCalendarInterestModal(raceId, responseType) {
  if (!calendarInterestModal || !calendarInterestForm || !calendarInterestRaceLabel) {
    return;
  }

  const entry = getCalendarEntryById(raceId);
  if (!entry) {
    return;
  }

  calendarSelectedRaceId = raceId;
  clearCalendarInterestMessage();
  setSelectedResponseType(responseType);
  updateCalendarDistanceSuggestions(entry);
  updateCalendarModalSummary(entry.id);

  const preservedName = normalizeCalendarText(calendarInterestAthleteNameInput && calendarInterestAthleteNameInput.value);
  calendarInterestForm.reset();

  if (calendarInterestAthleteNameInput) {
    calendarInterestAthleteNameInput.value = preservedName;
  }

  if (calendarInterestDistanceInput) {
    calendarInterestDistanceInput.value = getDefaultDistanceValue(entry);
  }

  calendarInterestRaceLabel.textContent = buildCalendarModalRaceLabel(entry);
  calendarInterestModal.classList.remove("calendar-interest-modal-hidden");
  calendarInterestModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("calendar-interest-modal-open");

  window.setTimeout(() => {
    if (calendarInterestAthleteNameInput) {
      calendarInterestAthleteNameInput.focus();
    }
  }, 20);
}

function closeCalendarInterestModal() {
  if (!calendarInterestModal) {
    return;
  }

  calendarInterestModal.classList.add("calendar-interest-modal-hidden");
  calendarInterestModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("calendar-interest-modal-open");
  calendarSelectedRaceId = "";
  clearCalendarInterestMessage();

  if (calendarLastFocusedElement && typeof calendarLastFocusedElement.focus === "function") {
    calendarLastFocusedElement.focus();
  }
}

function isCalendarInterestModalOpen() {
  return Boolean(calendarInterestModal) && !calendarInterestModal.classList.contains("calendar-interest-modal-hidden");
}

function setSelectedResponseType(value) {
  calendarSelectedResponseType = value === "registered" ? "registered" : "interested";

  calendarInterestTypeButtons.forEach((button) => {
    const isActive = String(button.dataset.calendarResponseType || "") === calendarSelectedResponseType;
    button.classList.toggle("toggle-button-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (calendarInterestSubmitButton) {
    calendarInterestSubmitButton.textContent =
      calendarSelectedResponseType === "registered" ? "Salvar como inscrito" : "Salvar interesse";
  }
}

async function handleCalendarInterestSubmit(event) {
  event.preventDefault();

  const race = getCalendarEntryById(calendarSelectedRaceId);
  if (!race) {
    showCalendarInterestMessage("Selecione uma prova antes de salvar.", true);
    return;
  }

  if (!isCalendarGoogleScriptConfigured()) {
    showCalendarInterestMessage("Configure o Apps Script para salvar respostas online.", true);
    return;
  }

  const fullName = normalizeCalendarText(calendarInterestAthleteNameInput && calendarInterestAthleteNameInput.value);
  const distance = normalizeCalendarText(calendarInterestDistanceInput && calendarInterestDistanceInput.value);

  if (!fullName) {
    showCalendarInterestMessage("Digite o nome do atleta.", true);
    if (calendarInterestAthleteNameInput) {
      calendarInterestAthleteNameInput.focus();
    }
    return;
  }

  if (!distance) {
    showCalendarInterestMessage("Informe a dist\u00e2ncia da prova.", true);
    if (calendarInterestDistanceInput) {
      calendarInterestDistanceInput.focus();
    }
    return;
  }

  setCalendarInterestFormDisabled(true);
  showStatus({
    title: "Salvando resposta...",
    text: "Aguarde enquanto atualizamos a prova selecionada.",
    busy: true
  });

  try {
    const saveResult = await saveCalendarRaceResponse({
      resource: CALENDAR_INTEREST_RESOURCE,
      responseType: calendarSelectedResponseType,
      fullName,
      distance,
      race: {
        id: race.id,
        title: race.title,
        date: race.date,
        time: race.time,
        location: race.location
      }
    });

    if (Array.isArray(saveResult.summaryEntries)) {
      applyCalendarSummary(saveResult.summaryEntries);
    } else {
      const refreshedSummary = await refreshCalendarRaceSummary({
        attempts: saveResult.syncStatus === "queued" ? 6 : 2,
        delayMs: 500
      });

      if (refreshedSummary) {
        applyCalendarSummary(refreshedSummary);
      }
    }

    renderRaceList(calendarEntries);
    updateCalendarStatus();
    closeCalendarInterestModal();

    showStatus({
      title: "Resposta registrada",
      text:
        calendarSelectedResponseType === "registered"
          ? "A prova foi atualizada com um novo inscrito."
          : "A prova foi atualizada com um novo interessado.",
      tone: "success",
      hideAfterMs: 4000
    });
  } catch (error) {
    console.error("Erro ao salvar a resposta da prova:", error);
    showCalendarInterestMessage("N\u00e3o foi poss\u00edvel salvar agora. Tente novamente em instantes.", true);
    showStatus({
      title: "Falha ao salvar",
      text: "Tivemos um problema ao registrar a resposta desta prova.",
      tone: "error",
      hideAfterMs: 5000
    });
  } finally {
    setCalendarInterestFormDisabled(false);
  }
}

async function fetchCalendarRaceSummary(options = {}) {
  const { throwOnError = false } = options;

  if (!isCalendarGoogleScriptConfigured()) {
    return [];
  }

  try {
    const separator = CALENDAR_GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
    const response = await fetch(
      `${CALENDAR_GOOGLE_SCRIPT_URL}${separator}action=${encodeURIComponent(CALENDAR_INTEREST_LIST_ACTION)}&ts=${Date.now()}`
    );

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.ok === false) {
      throw new Error(String(data.message || "A consulta das provas foi rejeitada."));
    }

    return Array.isArray(data.entries) ? data.entries.map(normalizeCalendarSummaryEntry).filter(Boolean) : [];
  } catch (error) {
    console.error("Erro ao consultar o resumo das provas:", error);
    if (throwOnError) {
      throw error;
    }
    return [];
  }
}

async function refreshCalendarRaceSummary(options = {}) {
  const attempts = Number.isFinite(options.attempts) ? options.attempts : 3;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 400;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const summaryEntries = await fetchCalendarRaceSummary({ throwOnError: attempt === attempts - 1 });

    if (summaryEntries.length || attempt === attempts - 1) {
      return summaryEntries;
    }

    await wait(delayMs);
  }

  return [];
}

async function saveCalendarRaceResponse(payload) {
  const body = JSON.stringify(payload);

  try {
    const response = await fetch(CALENDAR_GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    if (data && data.ok === false) {
      throw new Error(String(data.message || "A resposta da prova foi rejeitada."));
    }

    return {
      syncStatus: "synced",
      summaryEntries: Array.isArray(data && data.summaryEntries)
        ? data.summaryEntries.map(normalizeCalendarSummaryEntry).filter(Boolean)
        : null
    };
  } catch (error) {
    console.error("Erro ao enviar a resposta da prova:", error);
  }

  await fetch(CALENDAR_GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body
  });

  return {
    syncStatus: "queued",
    summaryEntries: null
  };
}

function applyCalendarSummary(entries) {
  calendarRaceSummaryById = new Map();

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    calendarRaceSummaryById.set(entry.raceId, entry);
  });

  if (calendarSelectedRaceId) {
    updateCalendarModalSummary(calendarSelectedRaceId);
  }
}

function normalizeCalendarSummaryEntry(entry) {
  if (!entry) {
    return null;
  }

  const raceId = normalizeCalendarText(entry.raceId);
  if (!raceId) {
    return null;
  }

  return {
    raceId,
    interestedCount: normalizeCount(entry.interestedCount),
    registeredCount: normalizeCount(entry.registeredCount)
  };
}

function normalizeCount(value) {
  const parsedValue = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
}

function getCalendarRaceSummary(raceId) {
  return (
    calendarRaceSummaryById.get(raceId) || {
      raceId,
      interestedCount: 0,
      registeredCount: 0
    }
  );
}

function updateCalendarModalSummary(raceId) {
  if (!calendarInterestModalChips) {
    return;
  }

  calendarInterestModalChips.innerHTML = buildCalendarInterestChipsMarkup(getCalendarRaceSummary(raceId));
}

function updateAthleteSuggestions() {
  if (!calendarInterestAthleteSuggestions) {
    return;
  }

  calendarInterestAthleteSuggestions.innerHTML = CALENDAR_SUGGESTED_NAMES
    .map((name) => normalizeCalendarText(name))
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)
    .sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }))
    .map((name) => `<option value="${escapeHtmlAttribute(name)}"></option>`)
    .join("");
}

function updateCalendarDistanceSuggestions(entry) {
  if (!calendarInterestDistanceSuggestions) {
    return;
  }

  calendarInterestDistanceSuggestions.innerHTML = entry.distances
    .map((distance) => `<option value="${escapeHtmlAttribute(distance)}"></option>`)
    .join("");
}

function setCalendarInterestFormDisabled(disabled) {
  if (calendarInterestAthleteNameInput) {
    calendarInterestAthleteNameInput.disabled = disabled;
  }

  if (calendarInterestDistanceInput) {
    calendarInterestDistanceInput.disabled = disabled;
  }

  if (calendarInterestSubmitButton) {
    calendarInterestSubmitButton.disabled = disabled;
  }

  calendarInterestTypeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function showCalendarInterestMessage(message, isError = false) {
  if (!calendarInterestFormMessage) {
    return;
  }

  calendarInterestFormMessage.textContent = message;
  calendarInterestFormMessage.classList.toggle("form-message-error", isError);
}

function clearCalendarInterestMessage() {
  showCalendarInterestMessage("", false);
}

function updateCalendarStatus() {
  if (!statusElement) {
    return;
  }

  const totalEntries = calendarEntries.length;
  if (!totalEntries) {
    statusElement.textContent = "Pronto para cadastrar";
    return;
  }

  const activeEntries = calendarEntries.filter((entry) => !entry.isFinished).length;
  const totalResponses = calendarEntries.reduce((total, entry) => {
    const summary = getCalendarRaceSummary(entry.id);
    return total + summary.interestedCount + summary.registeredCount;
  }, 0);

  statusElement.textContent = `${activeEntries} abertas | ${totalResponses} respostas`;
}

function getCalendarEntryById(raceId) {
  return calendarEntries.find((entry) => entry.id === raceId) || null;
}

function getDefaultDistanceValue(entry) {
  if (!entry || !entry.distances.length) {
    return "";
  }

  return entry.distances.length === 1 ? entry.distances[0] : "";
}

function buildCalendarModalRaceLabel(entry) {
  return [
    entry.title,
    formatDate(entry.date),
    entry.time || "Hor\u00e1rio a confirmar",
    entry.location || "Local a confirmar"
  ]
    .filter(Boolean)
    .join(" | ");
}

function isCalendarGoogleScriptConfigured() {
  return Boolean(CALENDAR_GOOGLE_SCRIPT_URL);
}

function formatDate(value) {
  const parsedDate = parseCalendarDate(value);
  if (!parsedDate) {
    return "Data a confirmar";
  }

  return parsedDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getMonthKey(value) {
  const safeValue = String(value || "").trim();
  const match = safeValue.match(/^(\d{4})-(\d{2})-/);

  if (!match) {
    return "sem-data";
  }

  return `${match[1]}-${match[2]}`;
}

function getMonthLabel(value) {
  const parsedDate = parseCalendarDate(value);
  if (!parsedDate) {
    return "Sem data";
  }

  const monthLabel = parsedDate.toLocaleDateString("pt-BR", { month: "long" });
  return monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
}

function parseDateValue(value) {
  const parsedDate = parseCalendarDate(value);
  return parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER;
}

function parseCalendarDate(value) {
  const safeValue = String(value || "").trim();
  const match = safeValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsedDate = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function isCalendarEventFinished(value) {
  const eventTime = parseDateValue(value);
  if (!Number.isFinite(eventTime) || eventTime === Number.MAX_SAFE_INTEGER) {
    return false;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return eventTime < todayStart;
}

function buildCalendarRaceId(entry, index) {
  const explicitId = normalizeCalendarText(entry && entry.id);
  if (explicitId) {
    return explicitId;
  }

  const parts = [
    normalizeCalendarDateValue(entry && entry.date),
    normalizeCalendarText(entry && entry.title),
    normalizeCalendarText(entry && entry.location)
  ];

  const generatedId = parts
    .filter(Boolean)
    .map((part) => slugifyCalendarText(part))
    .filter(Boolean)
    .join("-");

  return generatedId || `race-${index + 1}`;
}

function normalizeCalendarDateValue(value) {
  const safeValue = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
    return safeValue;
  }

  const slashMatch = safeValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${padCalendarNumber(slashMatch[2])}-${padCalendarNumber(slashMatch[1])}`;
  }

  return safeValue;
}

function normalizeCalendarTime(value) {
  const safeValue = String(value || "").trim();
  const match = safeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    return normalizeCalendarText(value);
  }

  return `${padCalendarNumber(match[1])}:${match[2]}`;
}

function normalizeCalendarUrl(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return "";
  }

  if (/^https?:\/\//i.test(safeValue)) {
    return safeValue;
  }

  if (/^www\./i.test(safeValue)) {
    return `https://${safeValue}`;
  }

  return safeValue;
}

function normalizeCalendarText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function slugifyCalendarText(value) {
  return normalizeCalendarText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function padCalendarNumber(value) {
  return `0${String(value || "").trim()}`.slice(-2);
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
  if (!statusBox || !statusBoxText || !statusSpinner) {
    return;
  }

  clearStatusHideTimeout();
  statusBox.className = "status-box status-box-hidden";
  statusBoxText.hidden = false;
  statusSpinner.classList.remove("status-spinner-hidden");
}

function clearStatusHideTimeout() {
  if (statusHideTimeoutId) {
    window.clearTimeout(statusHideTimeoutId);
    statusHideTimeoutId = null;
  }
}

function wait(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
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
