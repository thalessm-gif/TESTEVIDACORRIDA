(function () {
  function getKitWithdrawalAccess() {
    const source = (window.SITE_ACCESS_CONFIG && window.SITE_ACCESS_CONFIG.kitWithdrawal) || {};

    return {
      locked: Boolean(source.locked),
      submitLocked: Boolean(source.submitLocked),
      homeNotice: String(source.homeNotice || "A retirada de kits esta temporariamente indisponivel."),
      homeLinkText: String(source.homeLinkText || "Fechado temporariamente"),
      pageTitle: String(source.pageTitle || "Retirada de Kits temporariamente fechada"),
      pageMessage: String(source.pageMessage || "Esta area esta bloqueada no momento. Em breve ela sera reaberta para novos acessos."),
      pageSupport: String(source.pageSupport || "Se precisar de orientacao, fale com a equipe da assessoria."),
      submitButtonText: String(source.submitButtonText || "Envio indisponivel"),
      submitMessage: String(source.submitMessage || "O formulario continua visivel, mas o envio esta temporariamente bloqueado.")
    };
  }

  function applyHomeCardLock(access) {
    const card = document.querySelector("[data-kit-access-card]");
    if (!card || !access.locked) {
      return;
    }

    card.classList.add("feature-card-locked");
    card.setAttribute("aria-disabled", "true");
    card.setAttribute("title", access.pageTitle);

    card.addEventListener("click", (event) => {
      event.preventDefault();
    });

    const description = card.querySelector("p");
    if (description) {
      description.textContent = access.homeNotice;
    }

    const link = card.querySelector(".feature-link");
    if (link) {
      link.textContent = access.homeLinkText;
    }

    if (!card.querySelector(".feature-lock-pill")) {
      const lockPill = document.createElement("span");
      lockPill.className = "feature-lock-pill";
      lockPill.textContent = "Trancada";
      card.insertBefore(lockPill, link || null);
    }
  }

  function applyRetiradaPageLock(access) {
    const lockPanel = document.getElementById("kit-locked-panel");
    if (!lockPanel || !access.locked) {
      return;
    }

    document.body.classList.add("kit-page-locked");
    document.title = "Retirada de Kits | Fechada";
    lockPanel.classList.remove("access-lock-panel-hidden");

    const titleElement = document.getElementById("kit-locked-title");
    const messageElement = document.getElementById("kit-locked-message");
    const supportElement = document.getElementById("kit-locked-support");

    if (titleElement) {
      titleElement.textContent = access.pageTitle;
    }

    if (messageElement) {
      messageElement.textContent = access.pageMessage;
    }

    if (supportElement) {
      supportElement.textContent = access.pageSupport;
    }
  }

  const access = getKitWithdrawalAccess();

  window.getKitWithdrawalAccess = getKitWithdrawalAccess;
  window.isKitWithdrawalLocked = function isKitWithdrawalLocked() {
    return access.locked;
  };
  window.isKitWithdrawalSubmitLocked = function isKitWithdrawalSubmitLocked() {
    return access.submitLocked;
  };

  applyHomeCardLock(access);
  applyRetiradaPageLock(access);
}());
