window.VIDA_CORRIDA_SYSTEM_CONFIG = Object.freeze({
  googleAppsScript: Object.freeze({
    // Cole aqui a URL publicada do Apps Script principal.
    // Formato esperado: https://script.google.com/macros/s/.../exec
    url: "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec"
  }),

  kitWithdrawal: Object.freeze({
    // true = mostra somente os dados online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: true
  }),

  momentoRp: Object.freeze({
    // true = mostra somente os registros online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: true,
    resource: "rp",
    listAction: "rp-list"
  }),

  rankingPerformance: Object.freeze({
    listAction: "rp-list"
  }),

  collectiveTraining: Object.freeze({
    // true = usa somente a lista online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: true,
    listAction: "collective-training-list",
    resource: "collectiveTraining"
  })
});
