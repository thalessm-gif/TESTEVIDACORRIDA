# Sistema de retirada de kits

Aplicacao web simples para sua assessoria registrar atletas e organizar a retirada de kits.

## O que o sistema faz

- Cadastra nome completo, distancia e tamanho da camisa
- Mostra os nomes abaixo da lista, separados por distancia
- Ordena alfabeticamente dentro de cada distancia
- Mantem os dados salvos no navegador com `localStorage` e `IndexedDB`
- Exporta um arquivo CSV que pode ser aberto no Excel
- Pode carregar e enviar cada cadastro para um Google Sheets com Apps Script

## Como usar

1. Abra o arquivo `index.html` no navegador.
2. Preencha os campos e clique em `Enviar`.
3. A lista atualizada aparece automaticamente na mesma pagina.
4. Clique em `Exportar CSV` quando quiser baixar a planilha para Excel.

## Persistencia dos dados

- Sem Google Sheets: os cadastros ficam guardados no navegador atual. Se a pagina estiver sendo aberta diretamente como arquivo local, alguns navegadores podem limpar ou isolar esses dados.
- Com Google Sheets: a lista passa a ser carregada novamente sempre que a pagina abrir, o que resolve a perda de dados entre acessos.
- No modo `GOOGLE_SHEETS_ONLY_MODE`, o navegador limpa os dados locais ao entrar e mostra somente o que estiver salvo na planilha.

## Google Sheets opcional

Se quiser receber tudo em uma planilha online:

1. Crie uma planilha no Google Sheets.
2. Abra `Extensoes > Apps Script`.
3. Cole o conteudo de `google-apps-script/Code.gs`.
4. Publique como `Aplicativo da Web` com acesso para qualquer pessoa com o link.
5. Copie a URL publicada.
6. No arquivo `app.js`, preencha a constante `GOOGLE_SCRIPT_URL`.

Assim, cada novo cadastro sera salvo na tela, enviado para a planilha e recarregado automaticamente ao abrir a pagina novamente.

Importante:

- URL errada: `https://docs.google.com/spreadsheets/...`
- URL correta: `https://script.google.com/macros/s/.../exec`

Se quiser usar somente os dados da planilha, deixe `GOOGLE_SHEETS_ONLY_MODE = true` no arquivo `app.js`.

## Momento RP

A nova area `Momento RP` fica em `momento-rp.html` e usa o arquivo `momento-rp.js`.

Ela pode funcionar de duas formas:

- Sem Apps Script atualizado: os registros ficam apenas no navegador atual.
- Com Apps Script atualizado: os registros passam a ser gravados e lidos da aba `MomentoRP` na mesma planilha do Apps Script.

Para ativar a gravacao online do `Momento RP`:

1. Atualize o conteudo de `google-apps-script/Code.gs` com a versao atual do projeto.
2. Publique uma nova versao do Apps Script como `Aplicativo da Web`.
3. Confirme a URL publicada em `momento-rp.js` na constante `RP_GOOGLE_SCRIPT_URL`.

Observacoes:

- A retirada de kits continua funcionando normalmente no mesmo endpoint.
- A aba `MomentoRP` e criada automaticamente na planilha quando o primeiro registro for enviado.
- Com `RP_GOOGLE_SHEETS_ONLY_MODE = true`, a pagina mostra somente o que estiver salvo na planilha.
- Se o campo `Tempo anterior` ficar em branco, o registro sera salvo como `Primeira prova`.
- A foto do `Momento RP`, quando anexada, e salva no Google Drive e enviada ao grupo do Telegram do `Momento RP`.

## Treino Coletivo

A nova area `Treino Coletivo` fica em `treino-coletivo.html` e usa os arquivos `treino-coletivo-config.js` e `treino-coletivo.js`.

Para abrir uma nova lista de presenca:

1. Abra `treino-coletivo-config.js`.
2. Atualize `id`, `startsAtIso`, `decisionDeadlineIso`, `location` e `minimumParticipants`.
3. Salve o arquivo e publique/atualize o site.

Como funciona:

- O atleta informa o nome e entra na lista da sessao configurada.
- Se a lista nao atingir o minimo ate `decisionDeadlineIso`, a pagina passa a mostrar `TREINO COLETIVO CANCELADO`.
- Se atingir o minimo dentro do prazo, a pagina passa a mostrar `TREINO COLETIVO CONFIRMADO`.
- Os dados online ficam na aba `coletivos` do Apps Script.

Importante:

- Para a lista funcionar em todos os aparelhos, publique novamente o Apps Script com os arquivos atualizados da pasta `google-apps-script`.
- O projeto evita nomes duplicados na mesma sessao usando o nome normalizado do atleta.
- Quando nao houver treino aberto, altere `enabled: true` para `enabled: false` em `treino-coletivo-config.js` para esconder o card da home.

## Telegram opcional

O Apps Script deste projeto tambem pode enviar um relatorio atualizado para o Telegram sempre que um novo cadastro for recebido.
No `Momento RP`, o envio pode usar o mesmo bot, mas apontando para outro grupo e enviando somente o cadastro novo.

No editor do Apps Script, configure as propriedades em `Configuracoes do projeto > Propriedades do script`:

- `TELEGRAM_ENABLED`: `true` ou `false`
- `TELEGRAM_BOT_TOKEN`: token do bot
- `TELEGRAM_CHAT_ID`: id do grupo, canal ou conversa
- `TELEGRAM_RP_CHAT_ID`: id do grupo do `Momento RP`
- `TELEGRAM_RP_ENABLED`: opcional, use `true` ou `false` se quiser controlar o envio do `Momento RP` separadamente
- `TELEGRAM_COLLECTIVE_CHAT_ID`: id do grupo do `Treino Coletivo` (para o grupo novo, use `-1003944318693`)
- `TELEGRAM_COLLECTIVE_ENABLED`: opcional, use `true` ou `false` se quiser controlar o envio do `Treino Coletivo` separadamente
- `MOMENTO_RP_DRIVE_FOLDER_ID`: id da pasta do Google Drive onde as fotos do `Momento RP` serao salvas
- `DISTANCE_OPTIONS`: distancias na ordem desejada, por exemplo `5km, 10km`
- `SHIRT_SIZE_OPTIONS`: tamanhos de camisa na ordem desejada, por exemplo `PP, P, M, G, GG`

Assim o token nao fica exposto no codigo do site nem no repositorio.
Na propriedade `MOMENTO_RP_DRIVE_FOLDER_ID`, voce pode colar tanto o ID puro quanto a URL completa da pasta do Drive.

## Distancias configuraveis

As opcoes de distancia podem ficar em um unico lugar nas `Propriedades do script` do Apps Script.

Exemplos:

- `DISTANCE_OPTIONS = 5km, 10km`
- `DISTANCE_OPTIONS = 3km, 5km, 10km, 21km`

Depois de alterar essa propriedade, salve as `Propriedades do script` e recarregue a pagina da retirada de kits.
Se voce tambem tiver alterado o codigo do Apps Script, publique uma nova versao do aplicativo da web.

## Tamanhos de camisa configuraveis

Os tamanhos de camisa tambem podem ficar nas `Propriedades do script` do Apps Script.

Exemplos:

- `SHIRT_SIZE_OPTIONS = P, M, G, GG`
- `SHIRT_SIZE_OPTIONS = Baby Look P, Baby Look M, P, M, G, GG`

Depois de alterar essa propriedade, salve as `Propriedades do script` e recarregue a pagina da retirada de kits.
Se voce tambem tiver alterado o codigo do Apps Script, publique uma nova versao do aplicativo da web.

## Planilhas de consulta centralizadas

As paginas `Destaques Semanais`, `Ranking Circuito`, `Planos de Fidelizacao` e `Indicacao Amiga` usam uma unica planilha de leitura com varias abas.

1. Abra o arquivo `consulta-sheet-config.js`.
2. Preencha `sharedSheetUrl` com o link da planilha principal das consultas.
3. Ajuste os nomes das abas em `sharedTabs` para bater com a sua estrutura.
4. Mantenha a `Retirada de Kits` separada em `app.js`, porque ela continua usando o Apps Script proprio para escrita e sincronizacao.

## Trancar a retirada de kits

Se quiser fechar temporariamente o acesso da area de `Retirada de Kits`:

1. Abra o arquivo `site-access-config.js`.
2. Altere `locked: false` para `locked: true`.
3. Salve o arquivo e publique/atualize o site.

Para reabrir depois:

1. Abra `site-access-config.js`.
2. Troque `locked: true` por `locked: false`.
3. Salve e publique/atualize novamente.

Com isso, a pagina inicial mostra a area como trancada e a pagina `retirada-kits.html` passa a exibir uma mensagem de bloqueio sem carregar o formulario.

Se quiser manter a pagina aberta e bloquear apenas o botao de envio:

1. Abra `site-access-config.js`.
2. Deixe `locked: false`.
3. Altere `submitLocked: false` para `submitLocked: true`.
4. Salve e publique/atualize o site.

Para liberar o envio depois, troque `submitLocked: true` por `submitLocked: false`.

## Editor de avatares

Para manter os caminhos dos avatares em um lugar so, o projeto agora usa o arquivo `avatar-map-data.js`.

Se quiser cadastrar ou atualizar esses caminhos por uma janela do Windows:

1. Execute `abrir-editor-avatares.cmd`.
2. Escolha o tipo de chave (`ID`, `E-mail` ou `Nome`).
3. Preencha o identificador do atleta.
4. Informe o caminho do avatar ou clique em `Escolher imagem...`.
5. Clique em `Salvar arquivo`.

O editor grava os dados em `avatar-map-data.js`, que e carregado pelas paginas que exibem avatares.
