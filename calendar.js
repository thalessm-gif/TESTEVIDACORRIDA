const RACE_CALENDAR_ENTRIES = Array.isArray(window.RACE_CALENDAR_ENTRIES)
  ? window.RACE_CALENDAR_ENTRIES
  : [];

const statusElement = document.getElementById("calendar-status");
const raceListElement = document.getElementById("calendar-race-list");

initializeCalendarPage();

function initializeCalendarPage() {
  const entries = normalizeEntries(RACE_CALENDAR_ENTRIES);

  renderRaceList(entries);
  statusElement.textContent = entries.length ? "Agenda atualizada" : "Pronto para cadastrar";
}

function normalizeEntries(entries) {
  return [...entries]
    .filter(Boolean)
    .map((entry, index) => ({
      id: String(entry.id || `race-${index + 1}`),
      title: String(entry.title || "").trim(),
      date: String(entry.date || "").trim(),
      time: String(entry.time || "").trim(),
      location: String(entry.location || "").trim(),
      distances: Array.isArray(entry.distances)
        ? entry.distances.map((distance) => String(distance || "").trim()).filter(Boolean)
        : [],
      circuito: String(entry.circuito || "").trim().toLowerCase(),
      signupUrl: String(entry.signupUrl || "").trim(),
      signupLabel: String(entry.signupLabel || "").trim(),
      notes: String(entry.notes || "").trim(),
      isCircuit: ["sim", "true", "1", "yes"].includes(String(entry.circuito || "").trim().toLowerCase())
    }))
    .filter((entry) => entry.title)
    .sort((first, second) => {
      const firstTime = parseDateValue(first.date);
      const secondTime = parseDateValue(second.date);
      return firstTime - secondTime;
    });
}

function renderRaceList(entries) {
  if (!entries.length) {
    raceListElement.innerHTML = `
      <article class="calendar-empty-card">
        <p class="empty-state">Nenhuma prova cadastrada ainda. Atualize o arquivo <strong>calendar-data.js</strong> para alimentar esta agenda.</p>
      </article>
    `;
    return;
  }

  raceListElement.innerHTML = groupEntriesByMonth(entries)
    .map((group) => renderMonthSection(group))
    .join("");
}

function groupEntriesByMonth(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const monthKey = getMonthKey(entry.date);
    if (!groups.has(monthKey)) {
      groups.set(monthKey, {
        key: monthKey,
        label: getMonthLabel(entry.date),
        entries: []
      });
    }

    groups.get(monthKey).entries.push(entry);
  });

  return [...groups.values()];
}

function renderMonthSection(group) {
  return `
    <section class="calendar-month-section">
      <div class="calendar-month-header">
        <div>
          <p class="calendar-month-name">${escapeHtml(group.label)}</p>
        </div>
        <span class="calendar-month-count">${group.entries.length} prova${group.entries.length === 1 ? "" : "s"}</span>
      </div>

      <div class="calendar-month-races">
        ${group.entries.map((entry) => renderRaceCard(entry)).join("")}
      </div>
    </section>
  `;
}

function renderRaceCard(entry) {
  const signupAvailable = Boolean(entry.signupUrl);
  const circuitBadge = entry.isCircuit
    ? '<span class="calendar-race-badge">Circuito Riograndino</span>'
    : "";

  return `
    <article class="calendar-race-card">
      <div class="calendar-race-card-top">
        <div class="calendar-race-headline">
          ${circuitBadge}
          <div class="calendar-race-title-row">
            <h3>${escapeHtml(entry.title)}</h3>
          </div>
          <p>${escapeHtml(entry.location || "Local a confirmar")}</p>
        </div>
      </div>

      <div class="calendar-race-summary">
        <div class="calendar-race-meta-item">
          <span class="calendar-race-meta-label">Data</span>
          <strong>${escapeHtml(formatDate(entry.date))}</strong>
        </div>

        <div class="calendar-race-meta-item">
          <span class="calendar-race-meta-label">Horário</span>
          <strong>${escapeHtml(entry.time || "A confirmar")}</strong>
        </div>

        <div class="calendar-race-meta-item calendar-race-meta-item-distances">
          <span class="calendar-race-meta-label">Distâncias</span>
          <div class="calendar-distance-list">
            ${entry.distances.length
              ? entry.distances.map((distance) => `<span class="calendar-distance-chip">${escapeHtml(distance)}</span>`).join("")
              : '<span class="calendar-distance-chip">Em definição</span>'}
          </div>
        </div>
      </div>

      ${entry.notes ? `<p class="calendar-race-notes">${escapeHtml(entry.notes)}</p>` : ""}

      <div class="calendar-race-actions">
        ${signupAvailable
          ? `<a href="${escapeHtmlAttribute(entry.signupUrl)}" class="calendar-race-link" target="_blank" rel="noopener noreferrer">Link Inscrição</a>`
          : `<span class="calendar-race-link calendar-race-link-disabled" aria-disabled="true">Link em breve</span>`}
      </div>
    </article>
  `;
}

function formatDate(value) {
  const safeValue = String(value || "").trim();

  if (!safeValue) {
    return "Data a confirmar";
  }

  const parsedDate = new Date(`${safeValue}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return safeValue;
  }

  return parsedDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getMonthKey(value) {
  const safeValue = String(value || "").trim();
  const match = safeValue.match(/^(\d{4})-(\d{2})-/);

  if (!match) {
    return "sem-data";
  }

  return `${match[1]}-${match[2]}`;
}

function getMonthLabel(value) {
  const safeValue = String(value || "").trim();
  const parsedDate = new Date(`${safeValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Sem data";
  }

  const monthLabel = parsedDate.toLocaleDateString("pt-BR", { month: "long" });
  return monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
}

function parseDateValue(value) {
  const safeValue = String(value || "").trim();
  const parsedDate = new Date(`${safeValue}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? Number.MAX_SAFE_INTEGER : parsedDate.getTime();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
