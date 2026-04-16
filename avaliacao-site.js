const FEEDBACK_SYSTEM_CONFIG = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const FEEDBACK_SHARED_GOOGLE_SCRIPT_URL = String(
  ((FEEDBACK_SYSTEM_CONFIG.googleAppsScript || {}).url) ||
  "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec"
).trim();
const FEEDBACK_FEATURE_CONFIG = FEEDBACK_SYSTEM_CONFIG.siteFeedback || {};
const FEEDBACK_GOOGLE_SCRIPT_URL = FEEDBACK_SHARED_GOOGLE_SCRIPT_URL;
const FEEDBACK_RESOURCE = String(FEEDBACK_FEATURE_CONFIG.resource || "siteFeedback").trim();
const FEEDBACK_RATING_OPTIONS = [
  { value: 1, label: "Precisa melhorar" },
  { value: 2, label: "Regular" },
  { value: 3, label: "Bom" },
  { value: 4, label: "Muito bom" },
  { value: 5, label: "Excelente" }
];

const feedbackFormElement = document.getElementById("site-feedback-form");
const athleteNameElement = document.getElementById("site-feedback-athlete-name");
const athleteSuggestionsElement = document.getElementById("site-feedback-athlete-suggestions");
const commentElement = document.getElementById("site-feedback-comment");
const suggestionElement = document.getElementById("site-feedback-suggestion");
const ratingOptionsElement = document.getElementById("site-feedback-rating-options");
const formMessageElement = document.getElementById("site-feedback-form-message");
const feedbackFormStatusElement = document.getElementById("feedback-form-status");
const statusBox = document.getElementById("status-box");
const statusBoxTitle = document.getElementById("status-box-title");
const statusBoxText = document.getElementById("status-box-text");
const statusSpinner = document.getElementById("status-spinner");
const preloadedAthleteNames = Array.isArray(window.KIT_ATHLETE_NAMES) ? window.KIT_ATHLETE_NAMES : [];
const submitButton = feedbackFormElement ? feedbackFormElement.querySelector('button[type="submit"]') : null;

let selectedRating = 0;
let statusHideTimeoutId = null;

renderRatingOptions();
updateAthleteSuggestions();
setFeedbackFormStatus("Pronto para receber");
attachFeedbackEventListeners();

function attachFeedbackEventListeners() {
  if (ratingOptionsElement) {
    ratingOptionsElement.addEventListener("click", handleRatingOptionClick);
  }

  if (feedbackFormElement) {
    feedbackFormElement.addEventListener("submit", handleFeedbackSubmit);
  }
}

function handleRatingOptionClick(event) {
  const button = event.target.closest("[data-rating-value]");
  if (!button) {
    return;
  }

  selectedRating = normalizeFeedbackRating(button.dataset.ratingValue);
  renderRatingOptions();
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();

  if (isFeedbackFormDisabled()) {
    return;
  }

  const athleteName = normalizeText(athleteNameElement.value);
  const comment = normalizeText(commentElement.value);
  const suggestion = normalizeText(suggestionElement.value);

  if (!selectedRating || !comment) {
    showFeedbackMessage("Escolha uma nota e escreva sua avaliacao antes de enviar.", true);
    return;
  }

  const payload = {
    resource: FEEDBACK_RESOURCE,
    id: createFeedbackEntryId(),
    athleteName,
    rating: selectedRating,
    comment,
    suggestion,
    createdAt: new Date().toISOString()
  };

  setFeedbackFormDisabled(true);
  setFeedbackFormStatus("Enviando avaliacao");
  showStatus({
    title: "Enviando dados...",
    text: "Aguarde enquanto registramos sua avaliacao.",
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
      throw new Error(String(data.message || "O Apps Script rejeitou a avaliacao."));
    }

    feedbackFormElement.reset();
    selectedRating = 0;
    renderRatingOptions();
    setFeedbackFormStatus("Avaliacao enviada");
    showFeedbackMessage("Avaliacao enviada com sucesso. Obrigado pela opiniao.");
    showStatus({
      title: "Dados enviados com sucesso",
      text: "Sua avaliacao ja foi registrada na planilha.",
      tone: "success",
      hideAfterMs: 4000
    });
    athleteNameElement.focus();
  } catch (error) {
    console.error("Erro ao enviar avaliacao do site:", error);
    setFeedbackFormStatus("Falha no envio");
    showFeedbackMessage(
      "Nao foi possivel enviar agora. Verifique se o Apps Script foi atualizado e publicado com a aba Avaliacoes.",
      true
    );
    showStatus({
      title: "Falha ao enviar dados",
      text: String(error && error.message ? error.message : "Nao foi possivel concluir o envio agora."),
      tone: "error"
    });
  } finally {
    setFeedbackFormDisabled(false);
  }
}

function renderRatingOptions() {
  if (!ratingOptionsElement) {
    return;
  }

  ratingOptionsElement.innerHTML = FEEDBACK_RATING_OPTIONS
    .map((option) => {
      const isActive = option.value === selectedRating;
      const activeClass = isActive ? " toggle-button-active" : "";

      return `
        <button
          type="button"
          class="toggle-button feedback-rating-button${activeClass}"
          data-rating-value="${option.value}"
          aria-pressed="${isActive ? "true" : "false"}"
        >
          <span class="feedback-rating-button-stars">${buildFeedbackStarsHtml(option.value)}</span>
          <span class="feedback-rating-button-caption">${escapeHtml(option.label)}</span>
        </button>
      `;
    })
    .join("");
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

function setFeedbackFormDisabled(disabled) {
  [
    athleteNameElement,
    commentElement,
    suggestionElement,
    submitButton
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });

  if (ratingOptionsElement) {
    ratingOptionsElement.querySelectorAll("button").forEach((button) => {
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

function createFeedbackEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildFeedbackStarsHtml(rating) {
  const safeRating = normalizeFeedbackRating(rating);
  return "&#9733;".repeat(safeRating) + "&#9734;".repeat(5 - safeRating);
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeFeedbackRating(value) {
  const parsedValue = parseInt(String(value || "").trim(), 10);

  if (Number.isNaN(parsedValue) || parsedValue < 1 || parsedValue > 5) {
    return 0;
  }

  return parsedValue;
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
