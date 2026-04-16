const FEEDBACK_SYSTEM_CONFIG = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const FEEDBACK_SHARED_GOOGLE_SCRIPT_URL = String(
  ((FEEDBACK_SYSTEM_CONFIG.googleAppsScript || {}).url) ||
  "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec"
).trim();
const FEEDBACK_FEATURE_CONFIG = FEEDBACK_SYSTEM_CONFIG.siteFeedback || {};
const FEEDBACK_GOOGLE_SCRIPT_URL = FEEDBACK_SHARED_GOOGLE_SCRIPT_URL;
const FEEDBACK_RESOURCE = String(FEEDBACK_FEATURE_CONFIG.resource || "siteFeedback").trim();
const FEEDBACK_LIST_ACTION = String(FEEDBACK_FEATURE_CONFIG.listAction || "site-feedback-list").trim();
const FEEDBACK_SCORE_OPTIONS = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" }
];
const FEEDBACK_QUESTIONS = [
  {
    key: "navigation",
    shortLabel: "Navegacao",
    prompt: "Como voc\u00ea avalia a facilidade de navega\u00e7\u00e3o e uso do site (principalmente no celular)?"
  },
  {
    key: "clarity",
    shortLabel: "Rotina",
    prompt: "O quanto o site te ajuda na sua rotina como atleta (treinos, provas, informa\u00e7\u00f5es, etc.)?"
  },
  {
    key: "speed",
    shortLabel: "Equipe",
    prompt: "O site representa bem a assessoria e transmite profissionalismo e sentimento de equipe?"
  },
  {
    key: "usefulness",
    shortLabel: "Contato",
    prompt: "As informa\u00e7\u00f5es e formas de contato no site s\u00e3o claras e f\u00e1ceis de entender?"
  }
];

const feedbackFormElement = document.getElementById("site-feedback-form");
const athleteNameElement = document.getElementById("site-feedback-athlete-name");
const athleteSuggestionsElement = document.getElementById("site-feedback-athlete-suggestions");
const questionListElement = document.getElementById("site-feedback-question-list");
const suggestionElement = document.getElementById("site-feedback-suggestion");
const formMessageElement = document.getElementById("site-feedback-form-message");
const feedbackFormStatusElement = document.getElementById("feedback-form-status");
const feedbackTotalCountElement = document.getElementById("feedback-total-count");
const feedbackAverageValueElement = document.getElementById("feedback-average-value");
const feedbackAverageStarsFillElement = document.getElementById("feedback-average-stars-fill");
const statusBox = document.getElementById("status-box");
const statusBoxTitle = document.getElementById("status-box-title");
const statusBoxText = document.getElementById("status-box-text");
const statusSpinner = document.getElementById("status-spinner");
const preloadedAthleteNames = Array.isArray(window.KIT_ATHLETE_NAMES) ? window.KIT_ATHLETE_NAMES : [];
const submitButton = feedbackFormElement ? feedbackFormElement.querySelector('button[type="submit"]') : null;

const selectedScores = createEmptyScoreState();
let feedbackEntries = [];
let statusHideTimeoutId = null;

renderFeedbackQuestions();
updateAthleteSuggestions();
renderFeedbackSummary();
setFeedbackFormStatus("Carregando resumo");
attachFeedbackEventListeners();
initializeFeedbackPage();

function attachFeedbackEventListeners() {
  if (questionListElement) {
    questionListElement.addEventListener("click", handleScoreOptionClick);
  }

  if (feedbackFormElement) {
    feedbackFormElement.addEventListener("submit", handleFeedbackSubmit);
  }
}

async function initializeFeedbackPage() {
  showStatus({
    title: "Carregando dados...",
    text: "Aguarde enquanto buscamos o total de avalia\u00e7\u00f5es e a nota m\u00e9dia.",
    busy: true
  });

  try {
    feedbackEntries = await loadFeedbackEntriesFromGoogleSheets();
    renderFeedbackSummary();
    setFeedbackFormStatus("Pronto para receber");
    hideStatus();
  } catch (error) {
    console.error("Erro ao carregar o resumo da avalia\u00e7\u00e3o do site:", error);
    feedbackEntries = [];
    renderFeedbackSummary();
    setFeedbackFormStatus("Pronto para receber");
    showStatus({
      title: "N\u00e3o foi poss\u00edvel carregar o resumo",
      text: "O formul\u00e1rio continua dispon\u00edvel. Se o Apps Script estiver publicado, novas avalia\u00e7\u00f5es ainda podem ser enviadas.",
      tone: "error"
    });
  }
}

function handleScoreOptionClick(event) {
  const button = event.target.closest("[data-question-key][data-score-value]");
  if (!button) {
    return;
  }

  const questionKey = String(button.dataset.questionKey || "");
  if (!Object.prototype.hasOwnProperty.call(selectedScores, questionKey)) {
    return;
  }

  selectedScores[questionKey] = normalizeFeedbackScore(button.dataset.scoreValue);
  renderFeedbackQuestions();
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();

  if (isFeedbackFormDisabled()) {
    return;
  }

  const athleteName = normalizeText(athleteNameElement.value);
  const suggestion = normalizeText(suggestionElement.value);
  const missingQuestion = FEEDBACK_QUESTIONS.find((question) => !selectedScores[question.key] && selectedScores[question.key] !== 0);

  if (missingQuestion) {
    showFeedbackMessage("Responda \u00e0s quatro perguntas com notas de 0 a 5 antes de enviar.", true);
    return;
  }

  const averageRating = calculateAverageRating(selectedScores);
  const payload = {
    resource: FEEDBACK_RESOURCE,
    id: createFeedbackEntryId(),
    athleteName,
    navigation: selectedScores.navigation,
    clarity: selectedScores.clarity,
    speed: selectedScores.speed,
    usefulness: selectedScores.usefulness,
    averageRating,
    suggestion,
    createdAt: new Date().toISOString()
  };

  setFeedbackFormDisabled(true);
  setFeedbackFormStatus("Enviando avalia\u00e7\u00e3o");
  showStatus({
    title: "Enviando dados...",
    text: "Aguarde enquanto registramos sua avalia\u00e7\u00e3o.",
    busy: true
  });

  try {
    const response = await fetch(FEEDBACK_GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Resposta inesperada: ${response.status}`);
    }

    const data = await safeReadJson(response);
    if (data && data.ok === false) {
      throw new Error(String(data.message || "O Apps Script rejeitou a avalia\u00e7\u00e3o."));
    }

    feedbackEntries = await loadFeedbackEntriesFromGoogleSheets();
    renderFeedbackSummary();
    feedbackFormElement.reset();
    resetSelectedScores();
    renderFeedbackQuestions();
    setFeedbackFormStatus("Avalia\u00e7\u00e3o enviada");
    showFeedbackMessage("Obrigado por nos ajudar a melhorar nosso servi\u00e7o. \"Os desafios nos definem!\"");
    showStatus({
      title: "Obrigado por nos ajudar a melhorar nosso servi\u00e7o.",
      text: "\"Os desafios nos definem!\"",
      tone: "success",
      hideAfterMs: 4000
    });
    athleteNameElement.focus();
  } catch (error) {
    console.error("Erro ao enviar avalia\u00e7\u00e3o do site:", error);
    setFeedbackFormStatus("Falha no envio");
    showFeedbackMessage(
      "N\u00e3o foi poss\u00edvel enviar agora. Verifique se o Apps Script foi atualizado e publicado com a aba Avalia\u00e7oes.",
      true
    );
    showStatus({
      title: "Falha ao enviar dados",
      text: String(error && error.message ? error.message : "N\u00e3o foi poss\u00edvel concluir o envio agora."),
      tone: "error"
    });
  } finally {
    setFeedbackFormDisabled(false);
  }
}

function renderFeedbackQuestions() {
  if (!questionListElement) {
    return;
  }

  questionListElement.innerHTML = FEEDBACK_QUESTIONS
    .map((question, index) => `
      <article class="feedback-question-card">
        <div class="feedback-question-header">
          <span class="feedback-question-index">Pergunta ${index + 1}</span>
          <p class="feedback-question-title">${escapeHtml(question.prompt)}</p>
        </div>
        <div class="feedback-score-grid" role="group" aria-label="${escapeHtmlAttribute(question.prompt)}">
          ${FEEDBACK_SCORE_OPTIONS
            .map((option) => {
              const isActive = selectedScores[question.key] === option.value;
              const activeClass = isActive ? " toggle-button-active" : "";

              return `
                <button
                  type="button"
                  class="toggle-button feedback-score-button${activeClass}"
                  data-question-key="${escapeHtmlAttribute(question.key)}"
                  data-score-value="${option.value}"
                  aria-pressed="${isActive ? "true" : "false"}"
                >
                  ${option.label}
                </button>
              `;
            })
            .join("")}
        </div>
        <p class="feedback-question-scale">0 = muito ruim | 5 = excelente</p>
      </article>
    `)
    .join("");
}

function renderFeedbackSummary() {
  const totalEntries = feedbackEntries.length;
  const averageRating = totalEntries
    ? feedbackEntries.reduce((sum, entry) => sum + getEntryAverageRating(entry), 0) / totalEntries
    : 0;

  if (feedbackTotalCountElement) {
    feedbackTotalCountElement.textContent = String(totalEntries);
  }

  if (feedbackAverageValueElement) {
    feedbackAverageValueElement.textContent = formatAverageValue(averageRating);
  }

  if (feedbackAverageStarsFillElement) {
    feedbackAverageStarsFillElement.style.width = `${Math.max(0, Math.min(100, (averageRating / 5) * 100))}%`;
  }
}

async function loadFeedbackEntriesFromGoogleSheets() {
  const separator = FEEDBACK_GOOGLE_SCRIPT_URL.includes("?") ? "&" : "?";
  const response = await fetch(`${FEEDBACK_GOOGLE_SCRIPT_URL}${separator}action=${FEEDBACK_LIST_ACTION}&ts=${Date.now()}`);

  if (!response.ok) {
    throw new Error(`Resposta inesperada: ${response.status}`);
  }

  const data = await response.json();
  if (data && data.ok === false) {
    throw new Error(String(data.message || "A consulta da avalia\u00e7\u00e3o do site foi rejeitada."));
  }

  return Array.isArray(data.entries) ? data.entries.map(normalizeFeedbackEntry).filter(Boolean) : [];
}

function updateAthleteSuggestions() {
  if (!athleteSuggestionsElement) {
    return;
  }

  const uniqueNames = new Map();

  preloadedAthleteNames
    .map((name) => normalizeText(name))
    .filter(Boolean)
    .forEach((name) => {
      const normalizedKey = name.toLocaleLowerCase("pt-BR");
      if (!uniqueNames.has(normalizedKey)) {
        uniqueNames.set(normalizedKey, name);
      }
    });

  athleteSuggestionsElement.innerHTML = [...uniqueNames.values()]
    .sort((first, second) => first.localeCompare(second, "pt-BR", { sensitivity: "base" }))
    .map((name) => `<option value="${escapeHtmlAttribute(name)}"></option>`)
    .join("");
}

function normalizeFeedbackEntry(entry) {
  if (!entry) {
    return null;
  }

  const normalizedEntry = {
    id: String(entry.id || ""),
    athleteName: normalizeText(entry.athleteName),
    navigation: normalizeFeedbackScore(entry.navigation),
    clarity: normalizeFeedbackScore(entry.clarity),
    speed: normalizeFeedbackScore(entry.speed),
    usefulness: normalizeFeedbackScore(entry.usefulness),
    averageRating: normalizeNumericAverage(entry.averageRating),
    suggestion: normalizeText(entry.suggestion),
    createdAt: normalizeText(entry.createdAt)
  };

  const hasAllScores = FEEDBACK_QUESTIONS.every((question) => normalizedEntry[question.key] >= 0);
  return hasAllScores ? normalizedEntry : null;
}

function setFeedbackFormDisabled(disabled) {
  [
    athleteNameElement,
    suggestionElement,
    submitButton
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });

  if (questionListElement) {
    questionListElement.querySelectorAll("button").forEach((button) => {
      button.disabled = disabled;
    });
  }
}

function isFeedbackFormDisabled() {
  return Boolean(submitButton && submitButton.disabled);
}

function setFeedbackFormStatus(text) {
  if (feedbackFormStatusElement) {
    feedbackFormStatusElement.textContent = text;
  }
}

function showFeedbackMessage(message, isError = false) {
  if (!formMessageElement) {
    return;
  }

  formMessageElement.textContent = message;
  formMessageElement.style.color = isError ? "#ffd0d0" : "#d8ffef";
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

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function createEmptyScoreState() {
  return FEEDBACK_QUESTIONS.reduce((state, question) => {
    state[question.key] = null;
    return state;
  }, {});
}

function resetSelectedScores() {
  FEEDBACK_QUESTIONS.forEach((question) => {
    selectedScores[question.key] = null;
  });
}

function createFeedbackEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getEntryAverageRating(entry) {
  if (typeof entry.averageRating === "number" && !Number.isNaN(entry.averageRating)) {
    return entry.averageRating;
  }

  return calculateAverageRating(entry);
}

function calculateAverageRating(scoreState) {
  const scores = FEEDBACK_QUESTIONS.map((question) => normalizeFeedbackScore(scoreState[question.key]));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return Number((total / FEEDBACK_QUESTIONS.length).toFixed(1));
}

function formatAverageValue(value) {
  return Number(value || 0).toFixed(1).replace(".", ",");
}

function normalizeFeedbackScore(value) {
  const parsedValue = parseInt(String(value), 10);

  if (Number.isNaN(parsedValue) || parsedValue < 0 || parsedValue > 5) {
    return -1;
  }

  return parsedValue;
}

function normalizeNumericAverage(value) {
  const parsedValue = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : NaN;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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
