(function initZiliVideoSubtitles(global) {
  // YouTube issues hundreds of requests; the default 250-entry resource buffer can drop the
  // caption request we later look up, leaving translation stuck on "waiting_captions".
  if (/(^|\.)youtube\.com$/.test(location.hostname)) {
    try { performance.setResourceTimingBufferSize(2000); } catch {}
  }
  let active = false;
  let video = null;
  let track = null;
  let originalTrackMode = null;
  let timer = null;
  let host = null;
  let sourceLine = null;
  let translatedLine = null;
  let currentText = "";
  let status = "off";
  let inFlightSession = 0;
  let lastFailureAt = 0;
  let singleCueFallback = false;
  let sessionId = 0;
  let youtubeVideoId = "";
  let youtubeCues = [];
  let youtubeLoadingSession = 0;
  let youtubeLastAttemptAt = 0;
  let youtubeAttemptKey = "";
  const translations = new Map();

  function syncYouTubeVideo() {
    const nextId = ZiliVideoText.youtubeVideoId(location.href);
    if (nextId === youtubeVideoId) return;
    youtubeVideoId = nextId;
    youtubeCues = [];
    youtubeLoadingSession = 0;
    youtubeLastAttemptAt = 0;
    youtubeAttemptKey = "";
    currentText = "";
    translations.clear();
    sessionId += 1;
  }

  async function loadYouTubeCaptions() {
    if (!active || !youtubeVideoId || youtubeCues.length || youtubeLoadingSession === sessionId) return;
    if (Date.now() - youtubeLastAttemptAt < 1500) return;
    const resourceEntries = performance.getEntriesByType("resource");
    const resourceName = ZiliVideoText.youtubeCaptionResource(resourceEntries, location.href);
    if (!resourceName) {
      status = "waiting_captions";
      return;
    }
    const latestEntry = resourceEntries.filter(entry => entry.name === resourceName)
      .sort((a, b) => Number(b.startTime || 0) - Number(a.startTime || 0))[0];
    const attemptKey = `${resourceName}#${latestEntry?.startTime || 0}`;
    if (status === "caption_unavailable" && attemptKey === youtubeAttemptKey) return;
    youtubeAttemptKey = attemptKey;
    youtubeLastAttemptAt = Date.now();
    youtubeLoadingSession = sessionId;
    status = "loading_captions";
    const requestSession = sessionId;
    try {
      // Fetch the exact URL already requested by YouTube. It includes the page's
      // short-lived playback token; only subtitle text is sent to our model.
      const { cues } = await ZiliVideoText.fetchYouTubeCues(resourceEntries, location.href);
      if (!active || requestSession !== sessionId) return;
      if (!cues.length) {
        status = "caption_unavailable";
        return;
      }
      youtubeCues = cues;
      status = "active";
      tick();
    } catch {
      if (active && requestSession === sessionId) status = "caption_unavailable";
    } finally {
      if (youtubeLoadingSession === requestSession) youtubeLoadingSession = 0;
    }
  }

  function largestVisible(elements) {
    return Array.from(elements)
      .map(item => ({ item, rect: item.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 180 && rect.height > 100 && rect.bottom > 0 && rect.top < innerHeight)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.item || null;
  }

  // Embedded players (Bunny, Vimeo, Wistia…) keep the <video> inside a cross-origin iframe we
  // cannot read. Such pages often show a synced transcript beside the player instead.
  const PLAYER_IFRAME = 'iframe[allowfullscreen], iframe[allow*="fullscreen" i], iframe[src*="embed" i], iframe[src*="player" i], iframe[src*="video" i]';
  const TRANSCRIPT_ITEM = ':is([class*="transcript" i], [id*="transcript" i]) :is(li, [role="listitem"], [data-start], [data-time])';
  const ACTIVE_ITEM = ':is(.on, .active, .current, .is-active, .is-current, .highlighted, [aria-current="true"], [aria-current="time"])';

  function visibleVideo() {
    return largestVisible(document.querySelectorAll("video"))
      || (activeTranscriptItem(true) ? largestVisible(document.querySelectorAll(PLAYER_IFRAME)) : null);
  }

  function activeTranscriptItem(anyItem = false) {
    const active = document.querySelector(`${TRANSCRIPT_ITEM}${ACTIVE_ITEM}`);
    return active || (anyItem ? document.querySelector(TRANSCRIPT_ITEM) : null);
  }

  function transcriptText(item) {
    if (!item) return "";
    const copy = item.cloneNode(true);
    copy.querySelectorAll('[class*="translat" i], [data-translation], font').forEach(node => node.remove());
    copy.querySelectorAll("*").forEach(node => {
      if (/^\s*\d{1,2}(?::\d{2}){1,2}\s*$/.test(node.textContent || "")) node.remove();
    });
    return ZiliVideoText.cleanCue(String(copy.textContent || "").replace(/^\s*\d{1,2}(?::\d{2}){1,2}\s*/, ""));
  }

  function upcomingTranscript(count) {
    const texts = [];
    let node = activeTranscriptItem()?.nextElementSibling;
    while (node && texts.length < count) {
      const text = transcriptText(node);
      if (text) texts.push(text);
      node = node.nextElementSibling;
    }
    return texts;
  }

  function restoreTrack() {
    if (track && originalTrackMode !== null && track.mode === "hidden") {
      try { track.mode = originalTrackMode; } catch { /* The player may have replaced its track. */ }
    }
    track = null;
    originalTrackMode = null;
  }

  function chooseTrack() {
    if (!video) return;
    const candidates = Array.from(video.textTracks || [])
      .filter(item => item.kind === "subtitles" || item.kind === "captions");
    const next = candidates.find(item => item.mode === "showing") || candidates[0] || null;
    if (next === track) return;
    restoreTrack();
    track = next;
    if (track && track.mode === "disabled") {
      originalTrackMode = track.mode;
      track.mode = "hidden";
    }
  }

  function domCaption() {
    if (!video) return "";
    const videoRect = video.getBoundingClientRect();
    const scope = video.closest('[class*="player" i], [data-testid*="player" i]')
      || video.parentElement?.parentElement || document;
    const nodes = scope.querySelectorAll('[class*="subtitle" i], [class*="caption" i], [data-testid*="subtitle" i], [data-testid*="caption" i]');
    const matches = [];
    for (const node of nodes) {
      if (host?.contains(node) || node.closest("#huashao-tone-root, #zili-companion-root")) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 8 || rect.height > videoRect.height / 2) continue;
      if (rect.left > videoRect.right || rect.right < videoRect.left) continue;
      if (rect.top < videoRect.top + videoRect.height * 0.35 || rect.bottom > videoRect.bottom + 25) continue;
      if (getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none") continue;
      const text = ZiliVideoText.cleanCue(node.innerText || node.textContent);
      if (text.length >= 2 && text.length <= 300) matches.push({ text, area: rect.width * rect.height });
    }
    matches.sort((a, b) => a.area - b.area);
    return matches[0]?.text || "";
  }

  function captionText() {
    if (youtubeCues.length) return ZiliVideoText.cueAtTime(youtubeCues, video?.currentTime);
    chooseTrack();
    const activeCues = Array.from(track?.activeCues || []);
    const trackText = ZiliVideoText.cleanCue(activeCues.map(cue => cue.text).join(" "));
    if (video?.tagName === "IFRAME") return transcriptText(activeTranscriptItem());
    return trackText || domCaption();
  }

  function ensureOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.id = "zili-video-subtitle-root";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;pointer-events:none;display:none;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = '.box{margin:auto;max-width:90%;width:max-content;padding:7px 13px;border-radius:9px;background:rgba(15,20,28,.82);color:#fff;text-align:center;text-shadow:0 1px 2px #000;font:600 var(--zili-sub-size,20px)/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 4px 16px #0005}.source{font-size:.7em;opacity:.78;white-space:pre-wrap}.target{white-space:pre-wrap}';
    const box = document.createElement("div");
    box.className = "box";
    sourceLine = document.createElement("div");
    sourceLine.className = "source";
    translatedLine = document.createElement("div");
    translatedLine.className = "target";
    box.append(sourceLine, translatedLine);
    shadow.append(style, box);
    document.documentElement.appendChild(host);
  }

  function positionOverlay() {
    if (!host || !video) return;
    const fullscreen = document.fullscreenElement;
    const parent = fullscreen && fullscreen !== video && fullscreen.contains(video)
      ? fullscreen : document.documentElement;
    if (host.parentElement !== parent) parent.appendChild(host);
    const rect = video.getBoundingClientRect();
    // Scale with the player: about 4% of its height, so full screen gets big text and small players stay readable.
    const size = Math.round(Math.min(40, Math.max(18, rect.height * .04)));
    const boxHeight = size * 2.3 + 16;
    const parentRect = parent === document.documentElement
      ? { left: 0, top: 0 } : parent.getBoundingClientRect();
    const placement = {
      position: parent === document.documentElement ? "fixed" : "absolute",
      left: `${Math.max(0, rect.left - parentRect.left)}px`,
      top: `${Math.max(0, rect.bottom - parentRect.top - boxHeight - Math.min(70, rect.height * .08))}px`,
      width: `${rect.width}px`
    };
    host.style.setProperty("--zili-sub-size", `${size}px`);
    for (const [key, value] of Object.entries(placement)) {
      if (host.style[key] !== value) host.style[key] = value;
    }
  }

  function render() {
    if (!active || !host) return;
    positionOverlay();
    host.style.display = currentText ? "block" : "none";
    sourceLine.textContent = currentText;
    sourceLine.hidden = Boolean(youtubeCues.length && document.querySelector(".ytp-caption-segment"));
    translatedLine.textContent = currentText
      ? translations.get(currentText) || (status === "model_error" ? "翻译失败，请检查模型设置" : youtubeVideoId && !youtubeCues.length ? "正在读取英文字幕…" : "正在翻译字幕…")
      : "";
  }

  function remember(source, translated) {
    translations.set(source, translated);
    if (translations.size > 250) translations.delete(translations.keys().next().value);
  }

  async function requestTranslations() {
    if (!active || inFlightSession === sessionId || Date.now() - lastFailureAt < 5000) return;
    if (youtubeVideoId && !youtubeCues.length) return;
    const cueSource = youtubeCues.length ? youtubeCues : track?.cues;
    const upcoming = video?.tagName === "IFRAME" ? upcomingTranscript(7)
      : ZiliVideoText.upcomingCues(cueSource, video?.currentTime, 45, 8);
    const batch = [currentText, ...upcoming].filter((text, index, list) =>
      text && !translations.has(text) && list.indexOf(text) === index
    ).slice(0, singleCueFallback ? 1 : 8);
    if (!batch.length) return;
    const requestSession = sessionId;
    inFlightSession = requestSession;
    const response = await ZiliRuntime.send({ type: "ZILI_TRANSLATE_VIDEO_CUES", cues: batch }, { timeoutMs: 21000 });
    if (inFlightSession === requestSession) inFlightSession = 0;
    if (!active || requestSession !== sessionId) return;
    if (response?.ok && response.translations?.length === batch.length) {
      batch.forEach((text, index) => remember(text, response.translations[index]));
      status = "active";
    } else {
      status = "model_error";
      if (response?.error === "subtitle_format_invalid" && batch.length > 1) singleCueFallback = true;
      lastFailureAt = Date.now();
    }
    render();
  }

  function tick() {
    if (!active) return;
    syncYouTubeVideo();
    if (youtubeVideoId) void loadYouTubeCaptions();
    if (!video?.isConnected) {
      video = visibleVideo();
      restoreTrack();
    }
    if (!video) { status = "no_video"; return; }
    const text = captionText();
    if (text !== currentText) {
      currentText = text;
      if (!youtubeVideoId || youtubeCues.length) {
        status = text ? "active" : youtubeCues.length ? "ready" : "waiting";
      }
      render();
    }
    if (text || youtubeCues.length) void requestTranslations();
    if (host && text) positionOverlay();
  }

  function setActive(next) {
    if (!next) {
      active = false;
      sessionId += 1;
      clearInterval(timer);
      timer = null;
      restoreTrack();
      video = null;
      currentText = "";
      youtubeVideoId = "";
      youtubeCues = [];
      youtubeLoadingSession = 0;
      youtubeLastAttemptAt = 0;
      youtubeAttemptKey = "";
      status = "off";
      host?.remove();
      host = null;
      return { ok: true, active, status };
    }
    video = visibleVideo();
    if (!video) return { ok: false, active: false, status: "no_video" };
    active = true;
    sessionId += 1;
    singleCueFallback = false;
    lastFailureAt = 0;
    status = "waiting";
    ensureOverlay();
    tick();
    if (!timer) timer = setInterval(tick, 350);
    return { ok: true, active, status };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SETTINGS_UPDATED" && message.settings?.enabled === false) {
      setActive(false);
      return false;
    }
    if (message?.type === "ZILI_VIDEO_TRANSLATION_STATUS") {
      sendResponse({ ok: true, active, status });
      return false;
    }
    if (message?.type === "ZILI_VIDEO_TRANSLATION_SET") {
      sendResponse(setActive(message.active));
      return false;
    }
    return false;
  });
  global.ZiliVideoSubtitles = { isActive: () => active, setActive };
})(typeof globalThis !== "undefined" ? globalThis : window);
