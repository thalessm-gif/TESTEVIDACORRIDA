(function () {
  const systemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
  const googleScriptUrl = String(
    ((systemConfig.googleAppsScript || {}).url) || ""
  ).trim();
  const ADMIN_TOKEN_KEY = "vida-corrida-admin-token";

  const loginForm = document.getElementById("admin-login-form");
  const passwordInput = document.getElementById("admin-password");
  const loginButton = document.getElementById("admin-login-button");
  const logoutButton = document.getElementById("admin-logout-button");
  const configForm = document.getElementById("admin-config-form");
  const refreshButton = document.getElementById("admin-refresh-button");
  const statusElement = document.getElementById("admin-status");
  const loginPanel = document.getElementById("admin-login-panel");
  const configPanel = document.getElementById("admin-config-panel");

  const fields = {
    kitLocked: document.getElementById("admin-kit-locked"),
    kitSubmitLocked: document.getElementById("admin-kit-submit-locked"),
    kitHomeNotice: document.getElementById("admin-kit-home-notice"),
    kitHomeLinkText: document.getElementById("admin-kit-home-link-text"),
    kitPageTitle: document.getElementById("admin-kit-page-title"),
    kitPageMessage: document.getElementById("admin-kit-page-message"),
    kitPageSupport: document.getElementById("admin-kit-page-support"),
    kitSubmitButtonText: document.getElementById("admin-kit-submit-button-text"),
    kitSubmitMessage: document.getElementById("admin-kit-submit-message"),
    collectiveEnabled: document.getElementById("admin-collective-enabled"),
    collectiveId: document.getElementById("admin-collective-id"),
    collectiveTitle: document.getElementById("admin-collective-title"),
    collectiveDescription: document.getElementById("admin-collective-description"),
    collectiveStartsAtIso: document.getElementById("admin-collective-starts-at"),
    collectiveDecisionDeadlineIso: document.getElementById("admin-collective-deadline"),
    collectiveLocation: document.getElementById("admin-collective-location"),
    collectiveMinimumParticipants: document.getElementById("admin-collective-minimum"),
    guideStravaGroupUrl: document.getElementById("admin-guide-strava"),
    guideHandbookUrl: document.getElementById("admin-guide-handbook"),
    guideFeedbackUrl: document.getElementById("admin-guide-feedback")
  };

  let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";

  if (!loginForm || !configForm || !statusElement) {
    return;
  }

  loginForm.addEventListener("submit", handleLoginSubmit);
  configForm.addEventListener("submit", handleConfigSubmit);

  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      void loadConfig();
    });
  }

  if (!googleScriptUrl) {
    showStatus("Configure a URL do Apps Script em 00-EDITAR-AQUI/01-sistema-config.js.", true);
    setLoginDisabled(true);
    return;
  }

  if (adminToken) {
    void loadConfig();
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const password = String(passwordInput.value || "");
    if (!password) {
      showStatus("Digite a senha do painel.", true);
      passwordInput.focus();
      return;
    }

    setLoginDisabled(true);
    showStatus("Entrando...");

    try {
      const data = await postAdmin({
        action: "login",
        password
      });

      if (!data.ok) {
        throw new Error(data.message || "Nao foi possivel entrar.");
      }

      adminToken = String(data.token || "");
      sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      passwordInput.value = "";
      fillForm(data.config || {});
      showConfigPanel();
      showStatus("Acesso liberado.", false, true);
    } catch (error) {
      adminToken = "";
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      showLoginPanel();
      showStatus(error.message || "Nao foi possivel entrar.", true);
    } finally {
      setLoginDisabled(false);
    }
  }

  async function handleConfigSubmit(event) {
    event.preventDefault();

    if (!adminToken) {
      showLoginPanel();
      showStatus("Entre novamente para salvar.", true);
      return;
    }

    setConfigDisabled(true);
    showStatus("Salvando configuracoes...");

    try {
      const data = await postAdmin({
        action: "saveConfig",
        token: adminToken,
        config: readForm()
      });

      if (!data.ok) {
        throw new Error(data.message || "Nao foi possivel salvar.");
      }

      fillForm(data.config || {});
      showStatus("Configuracoes salvas. As paginas publicas ja podem carregar os novos dados.", false, true);
    } catch (error) {
      if (/sessao/i.test(error.message || "")) {
        handleLogout();
      }

      showStatus(error.message || "Nao foi possivel salvar.", true);
    } finally {
      setConfigDisabled(false);
    }
  }

  async function loadConfig() {
    if (!adminToken) {
      showLoginPanel();
      return;
    }

    setConfigDisabled(true);
    showStatus("Carregando configuracoes...");

    try {
      const data = await postAdmin({
        action: "getConfig",
        token: adminToken
      });

      if (!data.ok) {
        throw new Error(data.message || "Nao foi possivel carregar.");
      }

      fillForm(data.config || {});
      showConfigPanel();
      showStatus("Configuracoes carregadas.", false, true);
    } catch (error) {
      adminToken = "";
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      showLoginPanel();
      showStatus(error.message || "Entre novamente para acessar o painel.", true);
    } finally {
      setConfigDisabled(false);
    }
  }

  async function postAdmin(payload) {
    const response = await fetch(googleScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        resource: "admin",
        ...payload
      })
    });

    if (!response.ok) {
      throw new Error(`Resposta inesperada do Apps Script: ${response.status}`);
    }

    return await response.json();
  }

  function fillForm(config) {
    const kit = config.kitWithdrawal || {};
    const collective = config.collectiveTraining || {};
    const session = collective.session || {};
    const guide = config.athleteGuide || {};

    fields.kitLocked.checked = kit.locked === true;
    fields.kitSubmitLocked.checked = kit.submitLocked === true;
    fields.kitHomeNotice.value = kit.homeNotice || "";
    fields.kitHomeLinkText.value = kit.homeLinkText || "";
    fields.kitPageTitle.value = kit.pageTitle || "";
    fields.kitPageMessage.value = kit.pageMessage || "";
    fields.kitPageSupport.value = kit.pageSupport || "";
    fields.kitSubmitButtonText.value = kit.submitButtonText || "";
    fields.kitSubmitMessage.value = kit.submitMessage || "";

    fields.collectiveEnabled.checked = collective.enabled === true;
    fields.collectiveId.value = session.id || "";
    fields.collectiveTitle.value = session.title || "";
    fields.collectiveDescription.value = session.description || "";
    fields.collectiveStartsAtIso.value = session.startsAtIso || "";
    fields.collectiveDecisionDeadlineIso.value = session.decisionDeadlineIso || "";
    fields.collectiveLocation.value = session.location || "";
    fields.collectiveMinimumParticipants.value = session.minimumParticipants || 5;

    fields.guideStravaGroupUrl.value = guide.stravaGroupUrl || "";
    fields.guideHandbookUrl.value = guide.handbookUrl || "";
    fields.guideFeedbackUrl.value = guide.feedbackUrl || "";
  }

  function readForm() {
    const startsAtIso = getFieldValue(fields.collectiveStartsAtIso);

    return {
      kitWithdrawal: {
        locked: fields.kitLocked.checked,
        submitLocked: fields.kitSubmitLocked.checked,
        homeNotice: getFieldValue(fields.kitHomeNotice),
        homeLinkText: getFieldValue(fields.kitHomeLinkText),
        pageTitle: getFieldValue(fields.kitPageTitle),
        pageMessage: getFieldValue(fields.kitPageMessage),
        pageSupport: getFieldValue(fields.kitPageSupport),
        submitButtonText: getFieldValue(fields.kitSubmitButtonText),
        submitMessage: getFieldValue(fields.kitSubmitMessage)
      },
      collectiveTraining: {
        enabled: fields.collectiveEnabled.checked,
        session: {
          id: getFieldValue(fields.collectiveId) || buildCollectiveSessionId(startsAtIso),
          title: getFieldValue(fields.collectiveTitle),
          description: getFieldValue(fields.collectiveDescription),
          startsAtIso,
          decisionDeadlineIso: getFieldValue(fields.collectiveDecisionDeadlineIso),
          location: getFieldValue(fields.collectiveLocation),
          minimumParticipants: Number(fields.collectiveMinimumParticipants.value || 5)
        }
      },
      athleteGuide: {
        stravaGroupUrl: getFieldValue(fields.guideStravaGroupUrl),
        handbookUrl: getFieldValue(fields.guideHandbookUrl),
        feedbackUrl: getFieldValue(fields.guideFeedbackUrl)
      }
    };
  }

  function buildCollectiveSessionId(startsAtIso) {
    const normalizedDate = String(startsAtIso || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 12);

    if (!normalizedDate) {
      return "";
    }

    return `treino-coletivo-${normalizedDate.slice(0, 4)}-${normalizedDate.slice(4, 6)}-${normalizedDate.slice(6, 8)}-${normalizedDate.slice(8, 12)}`;
  }

  function getFieldValue(field) {
    return String((field && field.value) || "").trim();
  }

  function handleLogout() {
    adminToken = "";
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    showLoginPanel();
    showStatus("Sessao encerrada.");
    if (passwordInput) {
      passwordInput.focus();
    }
  }

  function showLoginPanel() {
    loginPanel.hidden = false;
    configPanel.hidden = true;
  }

  function showConfigPanel() {
    loginPanel.hidden = true;
    configPanel.hidden = false;
  }

  function showStatus(message, isError = false, isSuccess = false) {
    statusElement.textContent = message;
    statusElement.classList.toggle("admin-status-error", isError);
    statusElement.classList.toggle("admin-status-success", isSuccess && !isError);
  }

  function setLoginDisabled(disabled) {
    [passwordInput, loginButton].forEach((element) => {
      if (element) {
        element.disabled = disabled;
      }
    });
  }

  function setConfigDisabled(disabled) {
    const elements = configForm.querySelectorAll("input, textarea, button");
    elements.forEach((element) => {
      element.disabled = disabled;
    });

    if (logoutButton) {
      logoutButton.disabled = false;
    }
  }
}());
