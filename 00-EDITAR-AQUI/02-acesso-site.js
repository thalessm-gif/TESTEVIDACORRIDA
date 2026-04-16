// Arquivo editavel pelo administrador do site.
// Use este arquivo para trancar ou liberar areas sem mexer na logica.
window.SITE_ACCESS_CONFIG = Object.freeze({
  kitWithdrawal: Object.freeze({
    // Para trancar a area: true
    // Para reabrir a area: false
    locked: false,

    // Para deixar a pagina aberta e bloquear apenas o envio: true
    // Para liberar o envio novamente: false
    submitLocked: false,

    homeNotice: "A retirada de kits esta temporariamente indisponível.",
    homeLinkText: "Fechado temporariamente",
    pageTitle: "Retirada de Kits temporariamente fechada",
    pageMessage: "Esta área esta bloqueada no momento. Em breve ela será reaberta para novos acessos.",
    pageSupport: "Se precisar de orientação, fale com o seu treinador.",
    submitButtonText: "Envio indisponível",
    submitMessage: "O formulário continua visível, mas o envio está temporariamente bloqueado."
  })
});
