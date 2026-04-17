# Projeto 5 - Vida Corrida

Este projeto foi reorganizado para separar o que voce pode editar do que faz parte do motor do site.

## Onde editar

Use a pasta [00-EDITAR-AQUI](<C:\Users\thales.mirapalheta\Documents\New project 5\00-EDITAR-AQUI>) para as mudancas do dia a dia.

Se quiser editar sem abrir os arquivos manualmente, use [ABRIR-EDITOR-DO-SITE.cmd](<C:\Users\thales.mirapalheta\Documents\New project 5\00-EDITAR-AQUI\ABRIR-EDITOR-DO-SITE.cmd>). Ele abre uma janela do Windows com abas para cada arquivo editavel e cria backups automaticos em `_backups`.

Arquivos principais:

- `01-sistema-config.js`: URL principal do Apps Script e modos online/local
- `02-acesso-site.js`: trancar ou liberar a retirada de kits
- `03-treino-coletivo-config.js`: abrir/fechar treino coletivo, data, horario, local e minimo
- `04-planilhas-consulta.js`: planilha das paginas de consulta
- `05-calendario-provas.js`: provas do calendario
- `06-lista-atletas.js`: nomes usados nas sugestoes
- `07-avatares.js`: mapa de fotos dos atletas
- `08-versao-publicacao.json`: token unico de publicacao/cache aplicado pelo editor nas paginas HTML
- `LEIA-ME-PRIMEIRO.md`: guia rapido

Regra pratica:

- `Pode editar`: arquivos dentro de `00-EDITAR-AQUI`
- `Evite editar`: arquivos `.html`, `.js` e `.css` fora dessa pasta, a menos que seja uma mudanca estrutural

## Estrutura do projeto

- `index.html` e outras paginas `.html`: telas do site
- `styles.css`: visual geral do portal
- `app.js`, `momento-rp.js`, `ranking.js`, `treino-coletivo.js` etc.: logica interna
- `assets/`: imagens, logos e fotos
- `google-apps-script/`: codigo do Apps Script da planilha

## Tarefas comuns

### Trocar a URL do Apps Script

1. Abra `00-EDITAR-AQUI/01-sistema-config.js`
2. Atualize `googleAppsScript.url`
3. Salve e publique/atualize o site

### Abrir ou fechar treino coletivo

1. Abra `00-EDITAR-AQUI/03-treino-coletivo-config.js`
2. Ajuste `enabled`
3. Preencha `id`, `title`, `description`, `startsAtIso`, `decisionDeadlineIso`, `location` e `minimumParticipants`
4. Salve e publique/atualize o site

### Trancar a retirada de kits

1. Abra `00-EDITAR-AQUI/02-acesso-site.js`
2. Ajuste `locked` ou `submitLocked`
3. Salve e publique/atualize o site

### Atualizar a planilha de leitura

1. Abra `00-EDITAR-AQUI/04-planilhas-consulta.js`
2. Troque `sharedSheetUrl`
3. Revise os nomes das abas em `sharedTabs`

### Atualizar calendario de provas

1. Abra `00-EDITAR-AQUI/05-calendario-provas.js`
2. Edite os itens da lista `window.RACE_CALENDAR_ENTRIES`

### Atualizar lista de atletas

1. Abra o editor em `00-EDITAR-AQUI/ABRIR-EDITOR-DO-SITE.cmd`
2. Entre na aba `Atletas`
3. Use `Importar CSV` para substituir a lista inteira ou ajuste nomes manualmente
4. Clique em `Salvar arquivo`

### Atualizar avatares

1. Abra `00-EDITAR-AQUI/07-avatares.js`
2. Ajuste os campos `byId`, `byEmail` ou `byName`
3. Os arquivos de imagem continuam em `assets/avatars/`

### Atualizar o token de publicacao

1. Abra `00-EDITAR-AQUI/ABRIR-EDITOR-DO-SITE.cmd`
2. Entre na aba `Publicacao`
3. Clique em `Usar data e hora atual`
4. Clique em `Salvar arquivo`
5. Publique/atualize o site

Use esse passo sempre que mexer em HTML, CSS ou JS do site. Se a mudanca for so na planilha ou no Apps Script, normalmente nao precisa trocar o token.

## Apps Script

Se precisar atualizar o backend da planilha:

1. Abra a pasta [google-apps-script](<C:\Users\thales.mirapalheta\Documents\New project 5\google-apps-script>)
2. Publique novamente o aplicativo da web no Apps Script
3. Se a URL mudar, atualize `00-EDITAR-AQUI/01-sistema-config.js`

## Sugestao de uso

Se for mexer sozinho no projeto, comece sempre por:

1. `00-EDITAR-AQUI/LEIA-ME-PRIMEIRO.md`
2. O arquivo especifico da funcionalidade que voce quer atualizar

Se a mudanca nao couber em `00-EDITAR-AQUI`, ai sim vale mexer no restante do projeto.
