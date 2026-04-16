(function () {
  function hasCollectiveSessionInfo(session) {
    return Boolean(
      String(session.id || "").trim() &&
      String(session.startsAtIso || "").trim() &&
      String(session.decisionDeadlineIso || "").trim()
    );
  }

  function updateCollectiveHomeCardVisibility() {
    const collectiveHomeCard = document.querySelector("[data-collective-home-card]");
    if (!collectiveHomeCard) {
      return;
    }

    const collectiveHomeConfig = window.COLLECTIVE_TRAINING_CONFIG || {};
    const collectiveHomeSession = collectiveHomeConfig.session || {};
    const isEnabled = collectiveHomeConfig.enabled === true;
    const shouldShow = isEnabled && hasCollectiveSessionInfo(collectiveHomeSession);

    collectiveHomeCard.hidden = !shouldShow;
    collectiveHomeCard.setAttribute("aria-hidden", shouldShow ? "false" : "true");

    if (shouldShow) {
      collectiveHomeCard.style.removeProperty("display");
      return;
    }

    collectiveHomeCard.style.display = "none";
  }

  updateCollectiveHomeCardVisibility();
  document.addEventListener("DOMContentLoaded", updateCollectiveHomeCardVisibility);
  window.addEventListener("pageshow", updateCollectiveHomeCardVisibility);
}());
