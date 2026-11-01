(function initZiliVideoText(global) {
  function cleanCue(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, "")
      .replace(/[\u200b\u200e\u200f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  function upcomingCues(cues, time, seconds = 45, limit = 8) {
    const now = Number(time) || 0;
    const found = [];
    for (const cue of Array.from(cues || [])) {
      if (cue.endTime < now || cue.startTime > now + seconds) continue;
      const text = cleanCue(cue.text);
      if (text && !found.includes(text)) found.push(text);
      if (found.length >= limit) break;
    }
    return found;
  }

  function cueAtTime(cues, time) {
    const now = Number(time) || 0;
    let active = null;
    for (const cue of cues || []) {
      if (cue.startTime > now) break;
      if (cue.endTime > now) active = cue;
    }
    return active ? cleanCue(active.text) : "";
  }

  function youtubeVideoId(pageUrl) {
    try {
      const url = new URL(pageUrl);
      return /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === "/watch"
        ? url.searchParams.get("v") || "" : "";
    } catch { return ""; }
  }

  function youtubeCaptionResource(entries, pageUrl) {
    const videoId = youtubeVideoId(pageUrl);
    if (!videoId) return "";
    const matches = [];
    for (const entry of entries || []) {
      try {
        const url = new URL(entry.name);
        if (url.hostname !== "www.youtube.com" || url.pathname !== "/api/timedtext") continue;
        if (url.searchParams.get("v") !== videoId) continue;
        if (!/^en(?:-|$)/i.test(url.searchParams.get("lang") || "")) continue;
        if (url.searchParams.has("tlang")) continue;
        if (url.searchParams.get("fmt") !== "json3") continue;
        matches.push(entry);
      } catch { /* Ignore unrelated resource entries. */ }
    }
    matches.sort((a, b) =>
      Number(b.decodedBodySize || 0) - Number(a.decodedBodySize || 0)
      || Number(b.startTime || 0) - Number(a.startTime || 0)
    );
    return matches[0]?.name || "";
  }

  function parseYouTubeJson3(value) {
    let data;
    try { data = typeof value === "string" ? JSON.parse(value) : value; }
    catch { return []; }
    if (!Array.isArray(data?.events)) return [];
    const events = data.events.filter(event => Number.isFinite(event?.tStartMs));
    const cues = [];
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const text = cleanCue((event.segs || []).map(segment => segment.utf8 || "").join(""));
      if (!text) continue;
      const startTime = event.tStartMs / 1000;
      const nextStart = Number(events[index + 1]?.tStartMs);
      const duration = Number(event.dDurationMs);
      const endTime = startTime + (Number.isFinite(duration) && duration > 0
        ? duration / 1000
        : Number.isFinite(nextStart) && nextStart > event.tStartMs
          ? (nextStart - event.tStartMs) / 1000 : 3);
      cues.push({ startTime, endTime, text });
    }
    return cues.sort((a, b) => a.startTime - b.startTime);
  }

  async function fetchYouTubeCues(entries, pageUrl, fetchImpl = fetch) {
    const resourceName = youtubeCaptionResource(entries, pageUrl);
    if (!resourceName) return { found: false, cues: [] };
    const response = await fetchImpl(resourceName, { credentials: "include" });
    if (!response?.ok) return { found: true, cues: [] };
    return {
      found: true,
      cues: parseYouTubeJson3(await response.text())
    };
  }

  function parseTranslations(raw, expectedCount) {
    const source = String(raw || "").trim();
    if (!source) return null;
    let value;
    try {
      value = JSON.parse(source.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    } catch {
      return expectedCount === 1 ? [source.slice(0, 500)] : null;
    }
    if (expectedCount === 1 && typeof value === "string") {
      return [value.trim().slice(0, 500)];
    }
    if (expectedCount === 1 && typeof value?.translation === "string") {
      const translated = value.translation.trim().slice(0, 500);
      return translated ? [translated] : null;
    }
    const list = Array.isArray(value) ? value : value?.translations;
    if (!Array.isArray(list) || list.length !== expectedCount) return null;
    const result = list.map(item => typeof item === "string" ? item.trim().slice(0, 500) : "");
    return result.every(Boolean) ? result : null;
  }

  global.ZiliVideoText = {
    cleanCue,
    upcomingCues,
    cueAtTime,
    youtubeVideoId,
    youtubeCaptionResource,
    parseYouTubeJson3,
    fetchYouTubeCues,
    parseTranslations
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
