// Arquivo editavel pelo administrador do site.
// Use este arquivo para abrir, fechar e configurar o treino coletivo atual.
const collectiveSystemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const collectiveSharedGoogleScriptUrl = String(
  ((collectiveSystemConfig.googleAppsScript || {}).url) ||
  "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec"
).trim();
const collectiveSharedConfig = collectiveSystemConfig.collectiveTraining || {};

window.COLLECTIVE_TRAINING_CONFIG = {
  // Coloque true para exibir o card na home e liberar a pagina do treino coletivo.
  // Coloque false quando nao houver treino aberto.
  enabled: true,

  // A URL principal do Apps Script fica em 01-sistema-config.js.
  googleScriptUrl: collectiveSharedGoogleScriptUrl,

  // Mantenha true para a lista mostrar apenas o que estiver salvo online na planilha.
  // Troque para false apenas se quiser permitir funcionamento local no navegador.
  googleSheetsOnlyMode: collectiveSharedConfig.googleSheetsOnlyMode !== false,

  // Nao precisa alterar estas duas linhas, a menos que o backend do Apps Script mude.
  listAction: String(collectiveSharedConfig.listAction || "collective-training-list").trim(),
  resource: String(collectiveSharedConfig.resource || "collectiveTraining").trim(),
  session: {
    // Atualize os campos abaixo sempre que abrir uma nova lista de presenca.

    // Identificador unico da sessao.
    // Sugestao de formato: treino-coletivo-AAAA-MM-DD-HHMM
    id: "treino-coletivo-2026-04-16-1830",

    // Titulo exibido na pagina e usado no resumo enviado ao Telegram.
    title: "Cassino - Ciclovia",

    // Texto curto de apoio exibido abaixo do titulo da pagina.
    description: "Treinar é bom, mas treinar em grupo é melhor ainda.",

    // Data e horario do treino no formato ISO com fuso.
    // Exemplo: 2026-04-22T18:30:00-03:00
    startsAtIso: "2026-04-16T18:30:00-03:00",

    // Prazo final para decidir se o treino vai acontecer.
    // Se nao atingir o minimo ate este horario, a pagina mostra treino cancelado.
    decisionDeadlineIso: "2026-04-16T17:00:00-03:00",

    // Local que aparecera na pagina e na mensagem do Telegram.
    location: "Frente ao CADU",

    // Quantidade minima de confirmacoes para o treino ser considerado confirmado.
    minimumParticipants: 5
  }
};