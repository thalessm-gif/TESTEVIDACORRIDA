(function () {
  const rawAvatarMap = window.VIDA_CORRIDA_AVATAR_DATA || {
    byId: {},
    byEmail: {},
    byName: {}
  };

  function normalizeSimpleKey(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase();
  }

  function normalizeNameKey(value) {
    return normalizeSimpleKey(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ");
  }

  function buildMap(entries, normalizeKey) {
    return Object.entries(entries || {}).reduce((accumulator, [key, value]) => {
      const normalizedKey = normalizeKey(key);
      const normalizedValue = String(value || "").trim();

      if (!normalizedKey || !normalizedValue) {
        return accumulator;
      }

      accumulator[normalizedKey] = normalizedValue;
      return accumulator;
    }, {});
  }

  const normalizedAvatarMap = {
    byId: buildMap(rawAvatarMap.byId, normalizeSimpleKey),
    byEmail: buildMap(rawAvatarMap.byEmail, normalizeSimpleKey),
    byName: buildMap(rawAvatarMap.byName, normalizeNameKey)
  };

  function getVidaCorridaMappedAvatar({ athleteId = "", athleteEmail = "", athleteName = "" } = {}) {
    const athleteIdKey = normalizeSimpleKey(athleteId);
    if (athleteIdKey && normalizedAvatarMap.byId[athleteIdKey]) {
      return normalizedAvatarMap.byId[athleteIdKey];
    }

    const athleteEmailKey = normalizeSimpleKey(athleteEmail);
    if (athleteEmailKey && normalizedAvatarMap.byEmail[athleteEmailKey]) {
      return normalizedAvatarMap.byEmail[athleteEmailKey];
    }

    const athleteNameKey = normalizeNameKey(athleteName);
    if (athleteNameKey && normalizedAvatarMap.byName[athleteNameKey]) {
      return normalizedAvatarMap.byName[athleteNameKey];
    }

    return "";
  }

  window.VIDA_CORRIDA_AVATAR_MAP = rawAvatarMap;
  window.getVidaCorridaMappedAvatar = getVidaCorridaMappedAvatar;
}());
