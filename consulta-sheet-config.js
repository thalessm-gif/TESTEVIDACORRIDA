window.CONSULTA_SHEETS_CONFIG = Object.freeze({
  // Cole aqui o link da planilha unica usada pelas paginas de consulta.
  sharedSheetUrl: "https://docs.google.com/spreadsheets/d/1Bxr01crqfhNSKmWUz2Tkw8hsYqgFcc_Se9x_MwejsRo/edit?usp=sharing",

  // Nomes das abas dentro da planilha unica de consultas.
  // A retirada de kits continua separada no app.js.
  sharedTabs: Object.freeze({
    highlights: "Destaques",
    ranking: "Ranking",
    fidelity: "Fidelizacao",
    referral: "Indicacao"
  })
});

window.getConsultaSheetSource = function getConsultaSheetSource(key) {
  const config = window.CONSULTA_SHEETS_CONFIG || {};
  const sharedSheetUrl = String(config.sharedSheetUrl || "").trim();
  const sharedTabs = config.sharedTabs || {};
  const sharedTabName = String(sharedTabs[key] || "").trim();

  return {
    url: sharedSheetUrl,
    sheetName: sharedTabName,
    mode: "shared"
  };
};

window.buildGoogleSheetCsvUrl = function buildGoogleSheetCsvUrl(sheetUrl, sheetName) {
  const safeUrl = String(sheetUrl || "").trim();
  const safeSheetName = String(sheetName || "").trim();

  if (!safeUrl) {
    return "";
  }

  if (/export\?format=csv/i.test(safeUrl) || /tqx=out:csv/i.test(safeUrl)) {
    return safeUrl;
  }

  const match = safeUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (!match) {
    return safeUrl;
  }

  const sheetId = match[1];

  if (safeSheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(safeSheetName)}`;
  }

  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
};
