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
    label: "Leve / Facil",
    description: "Rodagem, recuperacao e construcao aerobica.",
    minFactor: 0.62,
    maxFactor: 0.7
  },
  {
    label: "Maratona",
    description: "Blocos continuos e ritmo sustentavel longo.",
    factor: 0.82
  },
  {
    label: "Limiar",
    description: "Trabalho de controle forte, mas sustentavel.",
    factor: 0.88
  },
  {
    label: "Intervalado",
    description: "Blocos fortes voltados ao teto aerobico.",
    factor: 1
  },
  {
    label: "Repeticao",
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

const VDOT_DEFAULT_ENVIRONMENT = {
  windDirection: "neutral",
  windSpeedKmh: "0",
  gradePercent: "0",
  temperatureCelsius: "18"
};

const WIND_COST_COEFFICIENT = 0.000014;
const TAILWIND_BENEFIT_FACTOR = 0.35;
const MIN_SOLVER_SPEED_METERS_PER_MINUTE = 30;
const MAX_SOLVER_SPEED_METERS_PER_MINUTE = 600;

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
const adjustmentImpact = document.getElementById("vdot-adjustment-impact");
const adjustmentNote = document.getElementById("vdot-adjustment-note");
const zoneGrid = document.getElementById("vdot-zone-grid");
const equivalentTableBody = document.getElementById("vdot-equivalent-table-body");
const equivalentCardList = document.getElementById("vdot-equivalent-card-list");
const windDirectionSelect = document.getElementById("vdot-wind-direction");
const windSpeedInput = document.getElementById("vdot-wind-speed");
const gradePercentInput = document.getElementById("vdot-grade-percent");
const temperatureInput = document.getElementById("vdot-temperature");

const environmentInputs = [
  windDirectionSelect,
  windSpeedInput,
  gradePercentInput,
  temperatureInput
].filter(Boolean);

const vdotState = {
  calculation: null
};

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
  adjustmentImpact &&
  adjustmentNote &&
  zoneGrid &&
  equivalentTableBody &&
  equivalentCardList &&
  windDirectionSelect &&
  windSpeedInput &&
  gradePercentInput &&
  temperatureInput
) {
  initializeVdotCalculator();
}

function initializeVdotCalculator() {
  distanceSelect.innerHTML = VDOT_RACE_OPTIONS
    .map((option) => `<option value="${option.meters}">${option.label}</option>`)
    .join("");

  applyDefaultInput();
  applyDefaultEnvironment();
  calculateAndRender();

  vdotForm.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateAndRender();
  });

  resetButton.addEventListener("click", () => {
    applyDefaultInput();
    applyDefaultEnvironment();
    calculateAndRender();
  });

  [hoursInput, minutesInput, secondsInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = String(input.value || "").replace(/\D/g, "").slice(0, 2);
    });
  });

  environmentInputs.forEach((input) => {
    input.addEventListener("change", handleEnvironmentChange);

    if (input.tagName !== "SELECT") {
      input.addEventListener("input", handleEnvironmentChange);
    }
  });
}

function applyDefaultInput() {
  distanceSelect.value = String(VDOT_DEFAULT_INPUT.meters);
  hoursInput.value = VDOT_DEFAULT_INPUT.hours;
  minutesInput.value = VDOT_DEFAULT_INPUT.minutes;
  secondsInput.value = VDOT_DEFAULT_INPUT.seconds;
}

function applyDefaultEnvironment() {
  windDirectionSelect.value = VDOT_DEFAULT_ENVIRONMENT.windDirection;
  windSpeedInput.value = VDOT_DEFAULT_ENVIRONMENT.windSpeedKmh;
  gradePercentInput.value = VDOT_DEFAULT_ENVIRONMENT.gradePercent;
  temperatureInput.value = VDOT_DEFAULT_ENVIRONMENT.temperatureCelsius;
  renderAdjustmentSummary(getEnvironmentSummary());
}

function handleEnvironmentChange() {
  if (vdotState.calculation) {
    renderCalculatedState(vdotState.calculation);
    return;
  }

  renderAdjustmentSummary(getEnvironmentSummary());
}

function calculateAndRender() {
  const parsedInput = parseRaceInput();

  if (!parsedInput.valid) {
    vdotState.calculation = null;
    renderInvalidState(parsedInput.message);
    renderAdjustmentSummary(getEnvironmentSummary());
    return;
  }

  const { meters, totalSeconds, label } = parsedInput;
  const vdot = calculateVdot(meters, totalSeconds);

  if (!Number.isFinite(vdot) || vdot <= 0) {
    vdotState.calculation = null;
    renderInvalidState("Nao foi possivel calcular o VDOT com esses dados.");
    renderAdjustmentSummary(getEnvironmentSummary());
    return;
  }

  const averagePaceSeconds = totalSeconds / (meters / 1000);
  const speedKmH = (meters / totalSeconds) * 3.6;
  const vdotRounded = roundToOne(vdot);
  const equivalentRaces = VDOT_EQUIVALENT_RACES.map((race) => {
    const predictedSeconds = predictRaceTimeFromVdot(race.meters, vdot);

    return {
      ...race,
      predictedSeconds,
      paceSeconds: predictedSeconds / (race.meters / 1000)
    };
  });

  vdotState.calculation = {
    label,
    totalSeconds,
    vdot,
    vdotRounded,
    averagePaceSeconds,
    speedKmH,
    equivalentRaces
  };

  renderCalculatedState(vdotState.calculation);
}

function renderCalculatedState(calculation) {
  const environmentSummary = getEnvironmentSummary(calculation.averagePaceSeconds);

  renderSummary({
    vdot: calculation.vdotRounded,
    averagePaceSeconds: calculation.averagePaceSeconds,
    speedKmH: calculation.speedKmH
  });

  renderZones(calculation.vdot, environmentSummary);
  renderEquivalentRaces(calculation.equivalentRaces);
  renderAdjustmentSummary(environmentSummary);

  statusBadge.textContent = `VDOT ${formatNumber(calculation.vdotRounded)}`;
  formMessage.textContent = `Referencia atualizada com base em ${calculation.label} em ${formatDuration(calculation.totalSeconds)}.`;
  formMessage.style.color = "#d8ffef";
  summaryNote.textContent = getSummaryNote(calculation.vdotRounded, calculation.label, environmentSummary);
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
      message: "Selecione uma distancia valida."
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
      <span class="rp-ranking-summary-label">Pace medio</span>
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

  statusBadge.textContent = "Aguardando calculo";
  formMessage.textContent = message;
  formMessage.style.color = "#ffd0d0";
  summaryNote.textContent = "Os ritmos aparecem depois que voce informa um resultado valido.";
}

function renderSummary(data) {
  summaryGrid.innerHTML = `
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">VDOT</span>
      <span class="rp-ranking-summary-value">${formatNumber(data.vdot)}</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Pace medio</span>
      <span class="rp-ranking-summary-value">${formatPace(data.averagePaceSeconds)}</span>
    </article>
    <article class="rp-ranking-summary-card">
      <span class="rp-ranking-summary-label">Velocidade</span>
      <span class="rp-ranking-summary-value">${formatNumber(roundToOne(data.speedKmH))} km/h</span>
    </article>
  `;
}

function renderZones(vdot, environmentSummary) {
  const vVo2Max = calculateVvo2Max(vdot);

  zoneGrid.innerHTML = VDOT_ZONE_DEFINITIONS
    .map((zone) => {
      if (Number.isFinite(zone.minFactor) && Number.isFinite(zone.maxFactor)) {
        const fasterBasePaceSeconds = secondsPerKmFromVelocity(vVo2Max * zone.maxFactor);
        const easierBasePaceSeconds = secondsPerKmFromVelocity(vVo2Max * zone.minFactor);
        const fasterAdjustedPaceSeconds = environmentSummary.hasAdjustments
          ? calculateAdjustedPaceSeconds(fasterBasePaceSeconds, environmentSummary.parameters)
          : fasterBasePaceSeconds;
        const easierAdjustedPaceSeconds = environmentSummary.hasAdjustments
          ? calculateAdjustedPaceSeconds(easierBasePaceSeconds, environmentSummary.parameters)
          : easierBasePaceSeconds;

        return `
          <article class="vdot-zone-card">
            <span class="vdot-zone-label">${zone.label}</span>
            <strong class="vdot-zone-value">${formatPace(fasterAdjustedPaceSeconds)} a ${formatPace(easierAdjustedPaceSeconds)}</strong>
            <p class="vdot-zone-note">
              ${zone.description}
              ${
                environmentSummary.hasAdjustments
                  ? `<span class="vdot-zone-impact">Base ideal: ${formatPace(fasterBasePaceSeconds)} a ${formatPace(easierBasePaceSeconds)}.</span>`
                  : ""
              }
            </p>
          </article>
        `;
      }

      const basePaceSeconds = secondsPerKmFromVelocity(vVo2Max * zone.factor);
      const adjustedPaceSeconds = environmentSummary.hasAdjustments
        ? calculateAdjustedPaceSeconds(basePaceSeconds, environmentSummary.parameters)
        : basePaceSeconds;

      return `
        <article class="vdot-zone-card">
          <span class="vdot-zone-label">${zone.label}</span>
          <strong class="vdot-zone-value">${formatPace(adjustedPaceSeconds)}</strong>
          <p class="vdot-zone-note">
            ${zone.description}
            ${
              environmentSummary.hasAdjustments
                ? `<span class="vdot-zone-impact">Base ideal: ${formatPace(basePaceSeconds)}.</span>`
                : ""
            }
          </p>
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
            <p class="ranking-stage-detail-meta">Pace medio ${formatPace(race.paceSeconds)}</p>
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
  const oxygenCost =
    0.182258 * velocityMetersPerMinute +
    0.000104 * velocityMetersPerMinute * velocityMetersPerMinute -
    4.6;
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

  return (1000 / velocityMetersPerMinute) * 60;
}

function velocityFromPaceSeconds(paceSeconds) {
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    return 0;
  }

  return 60000 / paceSeconds;
}

function calculateAcsmRunningVo2(velocityMetersPerMinute, grade = 0) {
  const slopeFactor = grade >= 0 ? 0.9 : 0.45;
  return (0.2 * velocityMetersPerMinute) + (slopeFactor * velocityMetersPerMinute * grade) + 3.5;
}

function calculateWindVo2Delta(velocityMetersPerMinute, parameters) {
  const windSpeedMetersPerMinute = kmhToMetersPerMinute(parameters.windSpeedKmh);

  if (!windSpeedMetersPerMinute || parameters.windDirection === "neutral") {
    return 0;
  }

  const calmAirCost = WIND_COST_COEFFICIENT * velocityMetersPerMinute * velocityMetersPerMinute;

  if (parameters.windDirection === "headwind") {
    const headwindAirCost = WIND_COST_COEFFICIENT * Math.pow(velocityMetersPerMinute + windSpeedMetersPerMinute, 2);
    return Math.max(0, headwindAirCost - calmAirCost);
  }

  const aidedRelativeSpeed = Math.max(velocityMetersPerMinute - windSpeedMetersPerMinute, 0);
  const tailwindAirCost = WIND_COST_COEFFICIENT * aidedRelativeSpeed * aidedRelativeSpeed;
  const rawBenefit = Math.max(0, calmAirCost - tailwindAirCost);

  return -rawBenefit * TAILWIND_BENEFIT_FACTOR;
}

function calculateEnvironmentalVo2(velocityMetersPerMinute, parameters) {
  return calculateAcsmRunningVo2(velocityMetersPerMinute, parameters.grade) +
    calculateWindVo2Delta(velocityMetersPerMinute, parameters);
}

function solveAdjustedVelocityFromTargetVo2(targetVo2, parameters, baseVelocityMetersPerMinute) {
  let lowerBound = MIN_SOLVER_SPEED_METERS_PER_MINUTE;
  let upperBound = Math.max(baseVelocityMetersPerMinute * 1.35, 180);

  while (
    calculateEnvironmentalVo2(upperBound, parameters) < targetVo2 &&
    upperBound < MAX_SOLVER_SPEED_METERS_PER_MINUTE
  ) {
    upperBound = Math.min(MAX_SOLVER_SPEED_METERS_PER_MINUTE, upperBound * 1.2);
  }

  for (let iteration = 0; iteration < 64; iteration += 1) {
    const midpoint = (lowerBound + upperBound) / 2;
    const midpointVo2 = calculateEnvironmentalVo2(midpoint, parameters);

    if (midpointVo2 > targetVo2) {
      upperBound = midpoint;
    } else {
      lowerBound = midpoint;
    }
  }

  return lowerBound;
}

function calculateAdjustedPaceSeconds(basePaceSeconds, parameters) {
  const baseVelocityMetersPerMinute = velocityFromPaceSeconds(basePaceSeconds);

  if (!baseVelocityMetersPerMinute) {
    return basePaceSeconds;
  }

  const idealVo2 = calculateAcsmRunningVo2(baseVelocityMetersPerMinute, 0);
  const effectiveTargetVo2 = Math.max(4, idealVo2 * (1 - parameters.performanceLoss));
  const adjustedVelocity = solveAdjustedVelocityFromTargetVo2(
    effectiveTargetVo2,
    parameters,
    baseVelocityMetersPerMinute
  );

  return secondsPerKmFromVelocity(adjustedVelocity);
}

function parseEnvironmentInputs() {
  const windDirection = windDirectionSelect.value || VDOT_DEFAULT_ENVIRONMENT.windDirection;
  const windSpeedKmh = Math.max(0, parseFloatInput(windSpeedInput.value, Number(VDOT_DEFAULT_ENVIRONMENT.windSpeedKmh)));
  const gradePercent = parseFloatInput(gradePercentInput.value, Number(VDOT_DEFAULT_ENVIRONMENT.gradePercent));
  const temperatureCelsius = parseFloatInput(
    temperatureInput.value,
    Number(VDOT_DEFAULT_ENVIRONMENT.temperatureCelsius)
  );

  return {
    windDirection,
    windSpeedKmh,
    gradePercent,
    temperatureCelsius
  };
}

function getEnvironmentSummary(referencePaceSeconds = null) {
  const inputs = parseEnvironmentInputs();
  const performanceLoss = calculateTemperaturePerformanceLoss(inputs.temperatureCelsius);
  const parameters = {
    grade: inputs.gradePercent / 100,
    gradePercent: inputs.gradePercent,
    windDirection: inputs.windDirection,
    windSpeedKmh: inputs.windDirection === "neutral" ? 0 : inputs.windSpeedKmh,
    rawWindSpeedKmh: inputs.windSpeedKmh,
    temperatureCelsius: inputs.temperatureCelsius,
    performanceLoss
  };

  const hasWindAdjustment = parameters.windDirection !== "neutral" && parameters.windSpeedKmh > 0;
  const hasGradeAdjustment = Math.abs(parameters.gradePercent) > 0;
  const hasTemperatureAdjustment = performanceLoss > 0;
  const hasAdjustments = hasWindAdjustment || hasGradeAdjustment || hasTemperatureAdjustment;

  if (!hasAdjustments || !Number.isFinite(referencePaceSeconds) || referencePaceSeconds <= 0) {
    return {
      parameters,
      hasAdjustments,
      referencePaceSeconds,
      adjustedReferencePaceSeconds: referencePaceSeconds,
      referenceDeltaSeconds: hasAdjustments ? null : 0
    };
  }

  const adjustedReferencePaceSeconds = calculateAdjustedPaceSeconds(referencePaceSeconds, parameters);

  return {
    parameters,
    hasAdjustments,
    referencePaceSeconds,
    adjustedReferencePaceSeconds,
    referenceDeltaSeconds: adjustedReferencePaceSeconds - referencePaceSeconds
  };
}

function calculateTemperaturePerformanceLoss(temperatureCelsius) {
  if (!Number.isFinite(temperatureCelsius)) {
    return 0;
  }

  if (temperatureCelsius > 18) {
    return Math.min(0.12, (temperatureCelsius - 18) * 0.0045);
  }

  if (temperatureCelsius < 5) {
    return Math.min(0.06, (5 - temperatureCelsius) * 0.0025);
  }

  return 0;
}

function renderAdjustmentSummary(environmentSummary = getEnvironmentSummary()) {
  if (!environmentSummary.hasAdjustments) {
    adjustmentImpact.textContent = "Ritmos base";
    adjustmentNote.textContent =
      "Sem ajustes ativos. Vento neutro, inclinacao 0% e temperatura em faixa ideal mantem a referencia base do VDOT.";
    return;
  }

  if (Number.isFinite(environmentSummary.referenceDeltaSeconds)) {
    adjustmentImpact.textContent = formatAdjustmentBadge(environmentSummary.referenceDeltaSeconds);
    adjustmentNote.textContent =
      `Estimativa no ritmo da prova: ${formatPace(environmentSummary.referencePaceSeconds)} para ` +
      `${formatPace(environmentSummary.adjustedReferencePaceSeconds)}. ` +
      `Condicoes consideradas: ${formatEnvironmentConditions(environmentSummary.parameters)}.`;
    return;
  }

  adjustmentImpact.textContent = "Ajuste ativo";
  adjustmentNote.textContent =
    `Condicoes consideradas: ${formatEnvironmentConditions(environmentSummary.parameters)}.`;
}

function formatEnvironmentConditions(parameters) {
  const parts = [];

  if (parameters.windDirection !== "neutral" && parameters.windSpeedKmh > 0) {
    parts.push(`vento ${getWindDirectionLabel(parameters.windDirection)} de ${formatCompactNumber(parameters.windSpeedKmh, 0, 1)} km/h`);
  }

  if (Math.abs(parameters.gradePercent) > 0) {
    parts.push(`inclinacao ${formatSignedPercent(parameters.gradePercent)}`);
  }

  if (parameters.performanceLoss > 0) {
    parts.push(
      `temperatura ${formatCompactNumber(parameters.temperatureCelsius, 0, 1)} C (~${formatPercent(parameters.performanceLoss)} de perda)`
    );
  } else {
    parts.push(`temperatura ${formatCompactNumber(parameters.temperatureCelsius, 0, 1)} C`);
  }

  return parts.join(", ");
}

function getWindDirectionLabel(direction) {
  if (direction === "headwind") {
    return "contra";
  }

  if (direction === "tailwind") {
    return "a favor";
  }

  return "neutro";
}

function getSummaryNote(vdot, label, environmentSummary) {
  let note;

  if (vdot < 39) {
    note = `Seu calculo veio de ${label}. Em VDOT abaixo de 39, os ritmos devem ser usados com ainda mais margem de sensacao e conversa.`;
  } else if (vdot >= 60) {
    note = `Seu calculo veio de ${label}. Em VDOT mais alto, detalhes como recuperacao, terreno e volume da semana fazem muita diferenca no ajuste fino.`;
  } else {
    note = `Seu calculo veio de ${label}. Use os ritmos como faixa de referencia e ajuste pela sensacao do dia, clima e tipo de treino.`;
  }

  if (!environmentSummary.hasAdjustments || !Number.isFinite(environmentSummary.referenceDeltaSeconds)) {
    return note;
  }

  if (environmentSummary.referenceDeltaSeconds > 0) {
    return `${note} Nas condicoes informadas, o ritmo de esforco ficou cerca de ${formatSecondsDelta(environmentSummary.referenceDeltaSeconds)} s/km mais conservador.`;
  }

  if (environmentSummary.referenceDeltaSeconds < 0) {
    return `${note} Nas condicoes informadas, o ritmo de esforco ficou cerca de ${formatSecondsDelta(environmentSummary.referenceDeltaSeconds)} s/km mais agressivo.`;
  }

  return note;
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

function parseFloatInput(value, fallback) {
  const normalizedValue = String(value ?? "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function formatCompactNumber(value, minimumFractionDigits = 0, maximumFractionDigits = 1) {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatPercent(value) {
  return Number(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }) + "%";
}

function formatSignedPercent(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCompactNumber(value, 0, 1)}%`;
}

function formatAdjustmentBadge(adjustmentSeconds) {
  if (Math.abs(adjustmentSeconds) < 0.05) {
    return "Ajuste leve";
  }

  const prefix = adjustmentSeconds > 0 ? "+" : "-";
  return `${prefix}${formatSecondsDelta(adjustmentSeconds)} s/km`;
}

function formatSecondsDelta(adjustmentSeconds) {
  const absoluteSeconds = Math.abs(adjustmentSeconds);

  if (absoluteSeconds >= 10) {
    return Math.round(absoluteSeconds).toLocaleString("pt-BR");
  }

  return absoluteSeconds.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function kmhToMetersPerMinute(speedKmh) {
  return (Number(speedKmh) * 1000) / 60;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
