const legacyCollectiveSystemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const legacyCollectiveSharedGoogleScriptUrl = String(
  ((legacyCollectiveSystemConfig.googleAppsScript || {}).url) || ""
).trim();
const legacyCollectiveSharedConfig = legacyCollectiveSystemConfig.collectiveTraining || {};

window.COLLECTIVE_TRAINING_CONFIG = {
  // Coloque true para exibir o card na home e liberar a pagina do treino coletivo.
  // Coloque false quando nao houver treino aberto.
  enabled: true,

  // A URL principal do Apps Script fica em 01-sistema-config.js.
  googleScriptUrl: legacyCollectiveSharedGoogleScriptUrl,

  // Mantenha true para a lista mostrar apenas o que estiver salvo online na planilha.
  // Troque para false apenas se quiser permitir funcionamento local no navegador.
  googleSheetsOnlyMode: legacyCollectiveSharedConfig.googleSheetsOnlyMode !== false,

  // Nao precisa alterar estas duas linhas, a menos que o backend do Apps Script mude.
  listAction: String(legacyCollectiveSharedConfig.listAction || "collective-training-list").trim(),
  resource: String(legacyCollectiveSharedConfig.resource || "collectiveTraining").trim(),
  session: {
    // Atualize os campos abaixo sempre que abrir uma nova lista de presenca.

    // Identificador unico da sessao.
    // Sugestao de formato: treino-coletivo-AAAA-MM-DD-HHMM
    id: "treino-coletivo-2026-04-22-1830",

    // Titulo exibido na pagina e usado no resumo enviado ao Telegram.
    title: "Coletivo de Quarta - Pancada",

    // Texto curto de apoio exibido abaixo do titulo da pagina.
    description: "Treinar é bom, mas treinar em grupo é melhor ainda.",

    // Data e horario do treino no formato ISO com fuso.
    // Exemplo: 2026-04-22T18:30:00-03:00
    startsAtIso: "2026-04-22T18:30:00-03:00",

    // Prazo final para decidir se o treino vai acontecer.
    // Se nao atingir o minimo ate este horario, a pagina mostra treino cancelado.
    decisionDeadlineIso: "2026-04-22T16:00:00-03:00",

    // Local que aparecera na pagina e na mensagem do Telegram.
    location: "Orla da Henrique Pancada",

    // Quantidade minima de confirmacoes para o treino ser considerado confirmado.
    minimumParticipants: 5
  }
};
