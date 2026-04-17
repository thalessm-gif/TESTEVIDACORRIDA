(function () {
  const guideConfig = ((window.VIDA_CORRIDA_SYSTEM_CONFIG || {}).athleteGuide) || {};
  const linkDefinitions = {
    strava: {
      url: String(guideConfig.stravaGroupUrl || "").trim(),
      activeLabel: "Abrir grupo no Strava",
      inactiveLabel: "Grupo em configuracao",
      inactiveNote: "Grupo em configuracao. Este acesso sera liberado em breve."
    },
    handbook: {
      url: String(guideConfig.handbookUrl || "").trim(),
      activeLabel: "Abrir cartilha em PDF",
      inactiveLabel: "Cartilha em atualizacao",
      inactiveNote: "A cartilha em PDF sera disponibilizada aqui."
    },
    feedback: {
      url: String(guideConfig.feedbackUrl || "").trim(),
      activeLabel: "Enviar feedback",
      inactiveLabel: "",
      inactiveNote: ""
    }
  };

  Object.entries(linkDefinitions).forEach(([key, definition]) => {
    const linkElements = document.querySelectorAll(`[data-guide-link="${key}"]`);
    const labelElements = document.querySelectorAll(`[data-guide-link-label="${key}"]`);
    const noteElements = document.querySelectorAll(`[data-guide-link-note="${key}"]`);
    const isOptional = key === "feedback";

    linkElements.forEach((element) => {
      if (!definition.url && isOptional) {
        element.hidden = true;
        return;
      }

      element.hidden = false;

      if (definition.url) {
        element.setAttribute("href", definition.url);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
        element.classList.remove("guide-action-card-disabled");
        element.removeAttribute("aria-disabled");
        element.removeAttribute("tabindex");
        return;
      }

      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
      element.classList.add("guide-action-card-disabled");
      element.setAttribute("aria-disabled", "true");
      element.setAttribute("tabindex", "-1");
    });

    labelElements.forEach((element) => {
      element.textContent = definition.url ? definition.activeLabel : definition.inactiveLabel;
    });

    noteElements.forEach((element) => {
      if (definition.url || !definition.inactiveNote) {
        element.hidden = true;
        element.textContent = "";
        return;
      }

      element.hidden = false;
      element.textContent = definition.inactiveNote;
    });
  });
})();
