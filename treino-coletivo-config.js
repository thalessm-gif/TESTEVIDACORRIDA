window.COLLECTIVE_TRAINING_CONFIG = {
  // Coloque true para exibir o card na home e liberar a pagina do treino coletivo.
  // Coloque false quando nao houver treino aberto.
  enabled: true,

  // Cole aqui a URL publicada do Apps Script da planilha.
  // Use o link no formato script.google.com/macros/s/.../exec.
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec",

  // Mantenha true para a lista mostrar apenas o que estiver salvo online na planilha.
  // Troque para false apenas se quiser permitir funcionamento local no navegador.
  googleSheetsOnlyMode: true,

  // Nao precisa alterar estas duas linhas, a menos que o backend do Apps Script mude.
  listAction: "collective-training-list",
  resource: "collectiveTraining",
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
