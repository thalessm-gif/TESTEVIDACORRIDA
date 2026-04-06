function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "list";

  if (action !== "list") {
    return outputJson_({ ok: false, message: "Acao invalida." });
  }

  var sheet = getOrCreateSheet_();
  var entries = listarInscricoes_(sheet);

  return outputJson_({ ok: true, entries: entries });
}

function doPost(e) {
  var sheet = getOrCreateSheet_();
  var payload = parsePayload_(e);

  if (!payload.fullName || !payload.distance || !payload.shirtSize) {
    return outputJson_({ ok: false, message: "Campos obrigatorios ausentes." });
  }

  ensureHeader_(sheet);

  sheet.appendRow([
    payload.id || Utilities.getUuid(),
    payload.createdAt || new Date().toISOString(),
    payload.fullName,
    payload.distance,
    payload.shirtSize
  ]);

  ordenarPlanilha_(sheet);

  var telegramStatus = sendTelegramReportIfConfigured_(sheet);

  return outputJson_({
    ok: true,
    telegram: telegramStatus
  });
}

function parsePayload_(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return {};
  }
}

function getOrCreateSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("Inscricoes");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Inscricoes");
  }

  ensureHeader_(sheet);
  return sheet;
}

function ensureHeader_(sheet) {
  var currentHeader = sheet.getRange(1, 1, 1, 5).getValues()[0];
  var expectedHeader = ["ID", "Data", "Nome completo", "Distancia", "Tamanho da camisa"];

  if (String(currentHeader[0]).trim() === "ID") {
    return;
  }

  if (String(currentHeader[0]).trim() === "Data") {
    sheet.insertColumnBefore(1);
  }

  sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
}

function listarInscricoes_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  return values
    .map(function(row, index) {
      return {
        id: row[0] || "legacy-" + index + "-" + row[2] + "-" + row[3],
        createdAt: formatDateValue_(row[1]),
        fullName: row[2] || "",
        distance: row[3] || "",
        shirtSize: row[4] || ""
      };
    })
    .filter(function(entry) {
      return entry.fullName && entry.distance && entry.shirtSize;
    })
    .sort(function(a, b) {
      var distanceDiff = getDistanceWeight_(a.distance) - getDistanceWeight_(b.distance);
      if (distanceDiff !== 0) {
        return distanceDiff;
      }

      return String(a.fullName).localeCompare(String(b.fullName), "pt-BR");
    });
}

function ordenarPlanilha_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 2) {
    return;
  }

  var dataRange = sheet.getRange(2, 1, lastRow - 1, 5);
  var values = dataRange.getValues();

  values.sort(function(a, b) {
    var distanceDiff = getDistanceWeight_(a[3]) - getDistanceWeight_(b[3]);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }

    return String(a[2]).localeCompare(String(b[2]), "pt-BR");
  });

  dataRange.setValues(values);
}

function getDistanceWeight_(distance) {
  var distanceOrder = { "3km": 1, "5km": 2, "10km": 3, "21km": 4 };
  return distanceOrder[String(distance)] || 999;
}

function formatDateValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  return value ? String(value) : new Date().toISOString();
}

function getTelegramConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var enabledValue = String(properties.getProperty("TELEGRAM_ENABLED") || "true").toLowerCase();

  return {
    enabled: enabledValue !== "false",
    token: String(properties.getProperty("TELEGRAM_BOT_TOKEN") || "").trim(),
    chatId: String(properties.getProperty("TELEGRAM_CHAT_ID") || "").trim()
  };
}

function sendTelegramReportIfConfigured_(sheet) {
  var config = getTelegramConfig_();

  if (!config.enabled) {
    return { status: "disabled" };
  }

  if (!config.token || !config.chatId) {
    return { status: "not_configured" };
  }

  var entries = listarInscricoes_(sheet);
  if (!entries.length) {
    return { status: "empty" };
  }

  try {
    var messages = buildTelegramMessages_(entries);

    messages.forEach(function(message) {
      sendTelegramMessage_(config, message);
    });

    return {
      status: "sent",
      messages: messages.length
    };
  } catch (error) {
    console.error("Erro ao enviar relatorio para o Telegram:", error);
    return {
      status: "error",
      message: String(error && error.message ? error.message : error)
    };
  }
}

function buildTelegramMessages_(entries) {
  var grouped = {};
  var shirtCounts = {};

  entries.forEach(function(entry) {
    var distance = String(entry.distance || "").trim();
    var shirtSize = String(entry.shirtSize || "").trim().toUpperCase();

    if (!grouped[distance]) {
      grouped[distance] = [];
    }

    grouped[distance].push({
      fullName: String(entry.fullName || "").trim(),
      shirtSize: shirtSize
    });

    if (!shirtCounts[shirtSize]) {
      shirtCounts[shirtSize] = 0;
    }
    shirtCounts[shirtSize] += 1;
  });

  var distances = Object.keys(grouped).sort(function(a, b) {
    return getDistanceWeight_(a) - getDistanceWeight_(b);
  });

  var shirtOrder = ["PP", "P", "M", "G", "GG"];
  var shirts = Object.keys(shirtCounts).sort(function(a, b) {
    var aIndex = shirtOrder.indexOf(a);
    var bIndex = shirtOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) {
      return a.localeCompare(b, "pt-BR");
    }

    if (aIndex === -1) {
      return 1;
    }

    if (bIndex === -1) {
      return -1;
    }

    return aIndex - bIndex;
  });

  var summaryLines = [
    "<b>RELATORIO DE INSCRICOES</b>",
    "",
    "Total de inscritos: " + entries.length,
    "",
    "<b>Por distancia</b>"
  ];

  distances.forEach(function(distance) {
    summaryLines.push(distance + ": " + grouped[distance].length);
  });

  summaryLines.push("");
  summaryLines.push("<b>Camisas</b>");

  shirts.forEach(function(size) {
    summaryLines.push(size + ": " + shirtCounts[size]);
  });

  var messages = [summaryLines.join("\n")];

  distances.forEach(function(distance) {
    var athletes = grouped[distance].sort(function(a, b) {
      return a.fullName.localeCompare(b.fullName, "pt-BR", { sensitivity: "base" });
    });

    var chunkLines = [
      "<b>" + escapeTelegramHtml_(distance) + " (" + athletes.length + " atletas)</b>"
    ];

    athletes.forEach(function(athlete) {
      var nextLine = "- " + escapeTelegramHtml_(athlete.fullName) + " | " + escapeTelegramHtml_(athlete.shirtSize);

      if ((chunkLines.join("\n") + "\n" + nextLine).length > 3500) {
        messages.push(chunkLines.join("\n"));
        chunkLines = [
          "<b>" + escapeTelegramHtml_(distance) + " (continua)</b>"
        ];
      }

      chunkLines.push(nextLine);
    });

    messages.push(chunkLines.join("\n"));
  });

  return messages;
}

function sendTelegramMessage_(config, message) {
  var url = "https://api.telegram.org/bot" + config.token + "/sendMessage";

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    muteHttpExceptions: true,
    payload: {
      chat_id: config.chatId,
      text: message,
      parse_mode: "HTML"
    }
  });

  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("Telegram respondeu com status " + statusCode + ": " + response.getContentText());
  }
}

function testarTelegram() {
  var config = getTelegramConfig_();

  if (!config.token || !config.chatId) {
    throw new Error("Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nas Propriedades do script.");
  }

  sendTelegramMessage_(config, "<b>Teste do Telegram</b>\nA integracao com o Google Apps Script esta funcionando.");
  Logger.log("Mensagem de teste enviada com sucesso para o chat " + config.chatId);
}

function escapeTelegramHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function outputJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
