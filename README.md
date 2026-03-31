# Sistema de retirada de kits

Aplicacao web simples para sua assessoria registrar atletas e organizar a retirada de kits.

## O que o sistema faz

- Cadastra nome completo, distancia e tamanho da camisa
- Mostra os nomes abaixo da lista, separados por distancia
- Ordena alfabeticamente dentro de cada distancia
- Mantem os dados salvos no navegador com `localStorage`
- Exporta um arquivo CSV que pode ser aberto no Excel
- Pode enviar cada cadastro para um Google Sheets com Apps Script

## Como usar

1. Abra o arquivo `index.html` no navegador.
2. Preencha os campos e clique em `Enviar`.
3. A lista atualizada aparece automaticamente na mesma pagina.
4. Clique em `Exportar CSV` quando quiser baixar a planilha para Excel.

## Google Sheets opcional

Se quiser receber tudo em uma planilha online:

1. Crie uma planilha no Google Sheets.
2. Abra `Extensoes > Apps Script`.
3. Cole o conteudo de `google-apps-script/Code.gs`.
4. Publique como `Aplicativo da Web` com acesso para qualquer pessoa com o link.
5. Copie a URL publicada.
6. No arquivo `app.js`, preencha a constante `GOOGLE_SCRIPT_URL`.

Assim, cada novo cadastro sera salvo na tela e tambem enviado para a planilha.
