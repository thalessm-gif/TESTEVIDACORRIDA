const VDOT_RACE_OPTIONS = [
  { label: "1500 m", meters: 1500 },
  { label: "1 milha", meters: 1609.34 },
  { label: "3 km", meters: 3000 },
  { label: "5 km", meters: 5000 },
  { label: "10 km", meters: 10000 },
  { label: "15 km", meters: 15000 },
  { label: "10 milhas", meters: 16093.4 },
  { label: "21.1 km", meters: 21097.5 },
  { label: "25 km", meters: 25000 },
  { label: "30 km", meters: 30000 },
  { label: "42.2 km", meters: 42195 }
];

const VDOT_EQUIVALENT_RACES = [
  { label: "200 m", meters: 200 },
  { label: "400 m", meters: 400 },
  { label: "800 m", meters: 800 },
  { label: "1 km", meters: 1000 },
  { label: "3 km", meters: 3000 },
  { label: "5 km", meters: 5000 },
  { label: "10 km", meters: 10000 },
  { label: "15 km", meters: 15000 },
  { label: "21.1 km", meters: 21097.5 },
  { label: "42.2 km", meters: 42195 }
];

const VDOT_ZONE_DEFINITIONS = [
  {
    label: "Leve / Fácil",
    description: "Rodagem, recuperação e construção aeróbica.",
    minFactor: 0.62,
    maxFactor: 0.7
  },
  {
    label: "Maratona",
    description: "Blocos contínuos e ritmo sustentável longo.",
    factor: 0.82
  },
  {
    label: "Limiar",
    description: "Trabalho de controle forte, mas sustentável.",
    factor: 0.88
  },
  {
    label: "Intervalado",
    description: "Blocos fortes voltados ao teto aeróbico.",
    factor: 1
  },
  {
    label: "Repetição",
    description: "Trechos curtos para velocidade e economia.",
    factor: 1.05
  }
];

const VDOT_DEFAULT_INPUT = {
  meters: 10000,
  hours: "00",
  minutes: "48",
  seconds: "00"
};

const vdotForm = document.getElementById("vdot-form");
const distanceSelect = document.getElementById("vdot-race-distance");
const hoursInput = document.getElementById("vdot-hours");
const minutesInput = document.getElementById("vdot-minutes");
const secondsInput = document.getElementById("vdot-seconds");
const resetButton = document.getElementById("vdot-reset");
const formMessage = document.getElementById("vdot-form-message");
const statusBadge = document.getElementById("vdot-status");
const summaryGrid = document.getElementById("vdot-summary-grid");
const summaryNote = document.getElementById("vdot-summary-note");
const zoneGrid = document.getElementById("vdot-zone-grid");
const equivalentTableBody = document.getElementById("vdot-equivalent-table-body");
const equivalentCardList = document.getElementById("vdot-equivalent-card-list");

if (
  vdotForm &&
  distanceSelect &&
  hoursInput &&
  minutesInput &&
  secondsInput &&
  resetButton &&
  formMessage &&
  statusBadge &&
  summaryGrid &&
  summaryNote &&
  zoneGrid &&
  equivalentTableBody &&
  equivalentCardList
) {
  initializeVdotCalculator();
}

function initializeVdotCalculator() {
  distanceSelect.innerHTML = VDOT_RACE_OPTIONS
    .map((option) => `<option value="${option.meters}">${option.label}</option>`)
    .join("");

  applyDefaultInput();
  calculateAndRender();

  vdotForm.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateAndRender();
  });

  resetButton.addEventListener("click", () => {
    applyDefaultInput();
    calculateAndRender();
  });

  [hoursInput, minutesInput, secondsInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = String(input.value || "").replace(/\D/g, "").slice(0, 2);
    });
  });
}

function applyDefaultInput() {
  distanceSelect.value = String(VDOT_DEFAULT_INPUT.meters);
  hoursInput.value = VDOT_DEFAULT_INPUT.hours;
  minutesInput.value = VDOT_DEFAULT_INPUT.minutes;
  secondsInput.value = VDOT_DEFAULT_INPUT.seconds;
}

function calculateAndRender() {
  const parsedInput = parseRaceInput();

  if (!parsedInput.valid) {
    renderInvalidState(parsedInput.message);
    return;
  }

  const { meters, totalSeconds, label } = parsedInput;
  const vdot = calculateVdot(meters, totalSeconds);

  if (!Number.isFinite(vdot) || vdot <= 0) {
    renderInvalidState("Não foi possível calcular o VDOT com esses dados.");
    return;
  }

  const averagePaceSeconds = totalSeconds / (meters / 1000);
  const speedKmH = meters / totalSeconds * 3.6;
  const vdotRounded = roundToOne(vdot);
  const equivalentRaces = VDOT_EQUIVALENT_RACES.map((race) => {
    const predictedSeconds = predictRaceTimeFromVdot(race.meters, vdot);
    return {
      ...race,
      predictedSeconds,
      paceSeconds: predictedSeconds / (race.meters / 1000)
    };
  });

  renderSummary({
    vdot: vdotRounded,
    averagePaceSeconds,
    speedKmH
  });

  renderZones(vdot);
  renderEquivalentRaces(equivalentRaces);

  statusBadge.textContent = `VDOT ${formatNumber(vdotRounded)}`;
  formMessage.textContent = `Referência atualizada com base em ${label} em ${formatDuration(totalSeconds)}.`;
  formMessage.style.color = "#d8ffef";
  summaryNote.textContent = getSummaryNote(vdotRounded, label);
}

function parseRaceInput() {
  const meters = Number(distanceSelect.value);
  const label = getRaceLabel(meters);
  const hours = parseInteger(hoursInput.value);
  const minutes = parseInteger(minutesInput.value);
  const seconds = parseInteger(secondsInput.value);

  if (!Number.isFinite(meters) || meters <= 0) {
    return {
      valid: false,
      message: "Selecione uma distância válida."
    };
  }

  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59 || hours < 0 || hours > 23) {
    return {
      valid: false,
      message: "Use horas de 0 a 23 e minutos/segundos entre 0 e 59."
    };
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (!totalSeconds) {
    return {
      valid: false,
      message: "Informe um tempo maior que zero."
    };
  }

  return {
    valid: true,
    meters,
    label,
    totalSeconds
  };
}

function renderInvalidState(message) {
  summaryGrid.innerHTML = `
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">VDOT</span>
      <span class="rp-ranking-summary-value">--</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Pace médio</span>
      <span class="rp-ranking-summary-value">--</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Velocidade</span>
      <span class="rp-ranking-summary-value">--</span>
    </article>
  `;
  zoneGrid.innerHTML = `
    <article class="vdot-zone-card">
      <p class="empty-state">${escapeHtml(message)}</p>
    </article>
  `;
  equivalentTableBody.innerHTML = `
    <tr>
      <td colspan="3">${escapeHtml(message)}</td>
    </tr>
  `;
  equivalentCardList.innerHTML = `
    <article class="ranking-athlete-card">
      <p class="ranking-card-empty">${escapeHtml(message)}</p>
    </article>
  `;

  statusBadge.textContent = "Aguardando cálculo";
  formMessage.textContent = message;
  formMessage.style.color = "#ffd0d0";
  summaryNote.textContent = "Os ritmos aparecem depois que você informa um resultado válido.";
}

function renderSummary(data) {
  summaryGrid.innerHTML = `
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">VDOT</span>
      <span class="rp-ranking-summary-value">${formatNumber(data.vdot)}</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Pace médio</span>
      <span class="rp-ranking-summary-value">${formatPace(data.averagePaceSeconds)}</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Velocidade</span>
      <span class="rp-ranking-summary-value">${formatNumber(roundToOne(data.speedKmH))} km/h</span>
    </article>
  `;
}

function renderZones(vdot) {
  const vVo2Max = calculateVvo2Max(vdot);

  zoneGrid.innerHTML = VDOT_ZONE_DEFINITIONS
    .map((zone) => {
      if (Number.isFinite(zone.minFactor) && Number.isFinite(zone.maxFactor)) {
        const fasterPace = formatPace(secondsPerKmFromVelocity(vVo2Max * zone.maxFactor));
        const easierPace = formatPace(secondsPerKmFromVelocity(vVo2Max * zone.minFactor));

        return `
          <article class="vdot-zone-card">
            <span class="vdot-zone-label">${zone.label}</span>
            <strong class="vdot-zone-value">${fasterPace} a ${easierPace}</strong>
            <p class="vdot-zone-note">${zone.description}</p>
          </article>
        `;
      }

      const pace = formatPace(secondsPerKmFromVelocity(vVo2Max * zone.factor));
      return `
        <article class="vdot-zone-card">
          <span class="vdot-zone-label">${zone.label}</span>
          <strong class="vdot-zone-value">${pace}</strong>
          <p class="vdot-zone-note">${zone.description}</p>
        </article>
      `;
    })
    .join("");
}

function renderEquivalentRaces(equivalentRaces) {
  equivalentTableBody.innerHTML = equivalentRaces
    .map((race) => `
      <tr>
        <td>${escapeHtml(race.label)}</td>
        <td>${formatDuration(race.predictedSeconds)}</td>
        <td>${formatPace(race.paceSeconds)}</td>
      </tr>
    `)
    .join("");

  equivalentCardList.innerHTML = equivalentRaces
    .map((race) => `
      <article class="ranking-athlete-card">
        <div class="vdot-equivalent-card-top">
          <div>
            <p class="ranking-stage-detail-title">${escapeHtml(race.label)}</p>
            <p class="ranking-stage-detail-meta">Pace médio ${formatPace(race.paceSeconds)}</p>
          </div>
          <strong class="vdot-equivalent-time">${formatDuration(race.predictedSeconds)}</strong>
        </div>
      </article>
    `)
    .join("");
}

function calculateVdot(distanceMeters, totalSeconds) {
  const timeMinutes = totalSeconds / 60;
  const velocityMetersPerMinute = distanceMeters / timeMinutes;
  const oxygenCost = 0.182258 * velocityMetersPerMinute + 0.000104 * velocityMetersPerMinute * velocityMetersPerMinute - 4.6;
  const oxygenFraction =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMinutes) +
    0.2989558 * Math.exp(-0.1932605 * timeMinutes);

  return oxygenCost / oxygenFraction;
}

function predictRaceTimeFromVdot(distanceMeters, targetVdot) {
  let lowerBoundMinutes = distanceMeters / 500;
  let upperBoundMinutes = distanceMeters / 80;

  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpointMinutes = (lowerBoundMinutes + upperBoundMinutes) / 2;
    const midpointVdot = calculateVdot(distanceMeters, midpointMinutes * 60);

    if (midpointVdot > targetVdot) {
      lowerBoundMinutes = midpointMinutes;
    } else {
      upperBoundMinutes = midpointMinutes;
    }
  }

  return Math.round(upperBoundMinutes * 60);
}

function calculateVvo2Max(vdot) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vdot;

  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function secondsPerKmFromVelocity(velocityMetersPerMinute) {
  if (!Number.isFinite(velocityMetersPerMinute) || velocityMetersPerMinute <= 0) {
    return 0;
  }

  return 1000 / velocityMetersPerMinute * 60;
}

function getSummaryNote(vdot, label) {
  if (vdot < 39) {
    return `Seu cálculo veio de ${label}. Em VDOT abaixo de 39, os ritmos devem ser usados com ainda mais margem de sensação e conversa.`;
  }

  if (vdot >= 60) {
    return `Seu cálculo veio de ${label}. Em VDOT mais alto, detalhes como recuperação, terreno e volume da semana fazem muita diferença no ajuste fino.`;
  }

  return `Seu cálculo veio de ${label}. Use os ritmos como faixa de referência e ajuste pela sensação do dia, clima e tipo de treino.`;
}

function getRaceLabel(meters) {
  const foundRace = VDOT_RACE_OPTIONS.find((race) => Math.abs(race.meters - meters) < 0.5);
  return foundRace ? foundRace.label : `${roundToOne(meters / 1000)} km`;
}

function formatDuration(totalSeconds) {
  const normalizedSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padNumber(minutes)}:${padNumber(seconds)}`;
  }

  return `${minutes}:${padNumber(seconds)}`;
}

function formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "--";
  }

  const roundedSeconds = Math.round(secondsPerKm);
  let minutes = Math.floor(roundedSeconds / 60);
  let seconds = roundedSeconds % 60;

  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }

  return `${minutes}:${padNumber(seconds)}/km`;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

function formatNumber(value) {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
