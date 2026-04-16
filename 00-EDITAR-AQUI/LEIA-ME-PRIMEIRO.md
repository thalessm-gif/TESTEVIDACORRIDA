# 00-EDITAR-AQUI

Edite somente os arquivos desta pasta quando quiser atualizar o site sem mexer no "motor" do projeto.

## Forma mais facil

1. De duplo clique em `ABRIR-EDITOR-DO-SITE.cmd`
2. O editor abre em uma janela do Windows com abas
3. Edite o arquivo desejado e salve pela propria janela

O editor cria backups automaticos na pasta `_backups`.

## Ordem mais comum de uso

1. `01-sistema-config.js`
Use para trocar a URL principal do Apps Script e os modos online/local.

2. `02-acesso-site.js`
Use para trancar ou reabrir a area de retirada de kits.

3. `03-treino-coletivo-config.js`
Use para abrir ou fechar um treino coletivo e preencher data, horario, local e minimo.

4. `04-planilhas-consulta.js`
Use para trocar a planilha de leitura das paginas de consulta.

5. `05-calendario-provas.js`
Use para cadastrar ou atualizar as provas do calendario.

6. `06-lista-atletas.js`
Use para manter a lista de nomes usada nas sugestoes do site. No editor, essa aba aceita importacao completa por CSV e ajustes manuais.

7. `07-avatares.js`
Use para ligar nomes/fotos dos atletas.

## Regra pratica

- `Pode editar`: arquivos desta pasta
- `Evite editar`: arquivos fora desta pasta, a menos que eu te indique

## Pastas importantes

- `assets/`: imagens e fotos
- `google-apps-script/`: codigo do Apps Script da planilha
