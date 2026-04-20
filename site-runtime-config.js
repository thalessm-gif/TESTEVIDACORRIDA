(function () {
  const systemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
  const googleScriptUrl = String(
    ((systemConfig.googleAppsScript || {}).url) || ""
  ).trim();

  if (!googleScriptUrl || /docs\.google\.com\/spreadsheets/i.test(googleScriptUrl)) {
    return;
  }

  function isPlainObject(value) {
    return Boolean(value) && Object.prototype.toString.call(value) === "[object Object]";
  }

  function cloneConfigValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneConfigValue);
    }

    if (isPlainObject(value)) {
      return mergeConfig({}, value);
    }

    return value;
  }

  function mergeConfig(baseConfig, nextConfig) {
    const mergedConfig = { ...(isPlainObject(baseConfig) ? baseConfig : {}) };

    if (!isPlainObject(nextConfig)) {
      return mergedConfig;
    }

    Object.keys(nextConfig).forEach((key) => {
      const currentValue = mergedConfig[key];
      const nextValue = nextConfig[key];

      if (isPlainObject(currentValue) && isPlainObject(nextValue)) {
        mergedConfig[key] = mergeConfig(currentValue, nextValue);
        return;
      }

      mergedConfig[key] = cloneConfigValue(nextValue);
    });

    return mergedConfig;
  }

  function applyRuntimeConfig(config) {
    if (!isPlainObject(config)) {
      return;
    }

    if (isPlainObject(config.systemConfig)) {
      window.VIDA_CORRIDA_SYSTEM_CONFIG = mergeConfig(
        window.VIDA_CORRIDA_SYSTEM_CONFIG || {},
        config.systemConfig
      );
    }

    if (isPlainObject(config.siteAccessConfig)) {
      window.SITE_ACCESS_CONFIG = mergeConfig(
        window.SITE_ACCESS_CONFIG || {},
        config.siteAccessConfig
      );
    }

    if (isPlainObject(config.collectiveTrainingConfig)) {
      window.COLLECTIVE_TRAINING_CONFIG = mergeConfig(
        window.COLLECTIVE_TRAINING_CONFIG || {},
        config.collectiveTrainingConfig
      );
    }
  }

  try {
    const separator = googleScriptUrl.includes("?") ? "&" : "?";
    const request = new XMLHttpRequest();

    request.open(
      "GET",
      `${googleScriptUrl}${separator}action=site-config&ts=${Date.now()}`,
      false
    );
    request.send(null);

    if (request.status < 200 || request.status >= 300) {
      return;
    }

    const data = JSON.parse(request.responseText || "{}");
    if (data && data.ok) {
      applyRuntimeConfig(data.config || {});
    }
  } catch (error) {
    console.error("Nao foi possivel carregar as configuracoes online do site:", error);
  }
}());
