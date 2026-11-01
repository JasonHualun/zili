(function mountZili() {
  const CONTENT_VERSION = "0.25.1";
  const MIN_GENERIC_LENGTH = 4;
  const MIN_SELECTION_LENGTH = 2;
  const INPUT_IDLE_MS = 1350;
  const MANUAL_ACTION_DELAY_MS = 220;
  const FOLLOWUP_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
  const CAT_ASSET_URL = chrome.runtime.getURL("assets/zili-siamese-cat.png");
  const COMPANION_THEME_ASSETS = { sage: "-sage", sand: "-sand", ink: "-ink" };
  const companionAssetUrl = theme => chrome.runtime.getURL(`assets/zili-companion-cat${COMPANION_THEME_ASSETS[theme] || ""}.png`);
  // Shown one at a time when the pointer reaches the cat; each tip appears once before any repeats.
  const COMPANION_TIPS = [
    "划一段英文，我帮你翻译",
    "网页不让复制？点“本页复制”",
    "嫌广告多？跟我说“清掉广告”",
    "说“只留 AI 相关”，我帮你脱水",
    "有字幕的视频，我能翻成中文",
    "截个图给我，我帮你看懂",
    "想换个说话风格？点我聊聊",
    "在输入框打字，我帮你润色",
    "划一道题，我帮你解",
    "无聊了？点我随便聊聊"
  ];
  const COMPANION_POSITION_KEY = "ziliCompanionPositionV1";
  const COMPOSER_SELECTOR = [
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    "textarea",
    'input[type="text"]'
  ].join(", ");
  const state = {
    activeComposer: null,
    settings: { ...ToneOptimizer.DEFAULTS },
    triggerReplies: ZiliTriggerRules.normalizeConfig(),
    methodCards: [],
    inputTimer: null,
    selectionTimer: null,
    statusTimer: null,
    requestId: 0,
    lastSourceText: "",
    lastAppliedText: "",
    lastSelection: "",
    selectionInfo: null,
    suppressInput: false,
    currentComment: null,
    currentRewrite: null,
    currentMethod: null,
    methodSuggestedText: "",
    architectRouteId: 0,
    architectRoutedText: "",
    architectLastResult: null,
    architectClarification: null,
    manualRewrite: null,
    manualMode: "rewrite",
    manualLength: "short",
    pendingRequest: null,
    tuneSettings: null,
    tuneChanged: false,
    screenshotOverlay: null,
    currentVision: null,
    followupSession: null,
    followupBusy: false,
    modelCanSeeImages: false,
    rewriteUndo: null,
    rewriteGuard: ZiliInteraction.createRewriteGuard(),
    panelPosition: null,
    panelDrag: null,
    host: null,
    shadow: null,
    settingsLoaded: false,
    companionHost: null,
    companionShadow: null,
    companionSpeechTimer: null,
    companionPosition: null,
    companionDrag: null,
    companionSuppressClick: false,
    assistantAttached: false,
    internalSelectionOrigin: false
  };

  function getText(element) {
    if (!element) return "";
    const value = element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
      ? element.value
      : element.innerText || element.textContent || "";
    return String(value)
      .replace(/\u200b/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isThoughtReady(text) {
    const source = String(text || "").trim();
    if (source.length < 4) return false;
    const clearQuestion = /能不能|可以吗|怎么|为什么|有没有|是否|能用|行吗|好吗|对吗|请问/.test(source);
    const clearOpinion = /我觉得|我想|我希望|其实|关键|问题|同意|不太|有点|感觉/.test(source);
    const closedEnding = /[。！？?!…]$/.test(source);
    return clearQuestion
      || (clearOpinion && source.length >= 5)
      || (closedEnding && source.length >= 5)
      || source.length >= MIN_GENERIC_LENGTH;
  }

  function isSensitiveComposer(element) {
    if (!element) return true;
    if (element instanceof HTMLInputElement && element.type.toLowerCase() !== "text") return true;
    if (element.disabled || element.readOnly || element.getAttribute("aria-disabled") === "true") return true;

    const autocomplete = String(element.getAttribute("autocomplete") || "").toLowerCase();
    if (/one-time-code|current-password|new-password|cc-number|cc-csc|cc-exp|cc-name|username|email|tel|street-address|postal-code/.test(autocomplete)) {
      return true;
    }

    let signals = [
      element.id,
      element.getAttribute("name"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      autocomplete,
      element.getAttribute("inputmode"),
      element.closest("form")?.getAttribute("action")
    ].filter(Boolean).join(" ");
    // AI 聊天网页的大输入框有时就叫 search（如 DeepSeek 的 name="search"），那是聊天框不是搜索框；
    // 只在已识别的 AI 聊天站点、且是多行输入框时放过“搜索”类字样，密码、支付等照旧拦。
    const aiChatBox = Boolean(globalThis.ZiliMethodLibrary?.platform(location.hostname))
      && (element instanceof HTMLTextAreaElement || element.isContentEditable);
    if (aiChatBox) signals = signals.replace(/搜索|search|query/gi, "");
    return /密码|验证码|信用卡|银行卡|支付|搜索|账号|邮箱|手机|地址|姓名|password|passcode|verification code|credit card|card number|payment|checkout|search|query|captcha|token|secret|username|email|phone|address|cvv|cvc/i.test(signals);
  }

  function resolveComposer(target) {
    if (!target || !(target instanceof Element)) return null;
    let composer = null;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      composer = target;
    } else {
      composer = target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]');
    }
    return composer && !isSensitiveComposer(composer) ? composer : null;
  }

  function isComposer(element) {
    return Boolean(resolveComposer(element));
  }

  function findLiveComposer(preferred, expectedText = "") {
    if (preferred && document.contains(preferred) && isComposer(preferred)) return resolveComposer(preferred);
    const active = resolveComposer(document.activeElement);
    if (active && document.contains(active)) return active;
    const candidates = Array.from(document.querySelectorAll(COMPOSER_SELECTOR))
      .map(resolveComposer)
      .filter(Boolean);
    return candidates.find(candidate => getText(candidate) === expectedText)
      || candidates.find(candidate => candidate.getBoundingClientRect().width > 0)
      || null;
  }

  function findVisibleComposer(preferred = state.activeComposer) {
    const candidates = [
      resolveComposer(preferred),
      resolveComposer(document.activeElement),
      ...Array.from(document.querySelectorAll(COMPOSER_SELECTOR)).map(resolveComposer)
    ].filter(Boolean);
    const uniqueCandidates = [...new Set(candidates)];
    return uniqueCandidates.find(candidate => {
      if (!document.contains(candidate)) return false;
      return ZiliInteraction.isVisibleRect(
        candidate.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight
      );
    }) || null;
  }

  function composerContext(element) {
    const label = [
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("placeholder")
    ].filter(Boolean).join(" / ").slice(0, 120);
    return `${location.hostname || "当前网页"}的文字输入框${label ? `（${label}）` : ""}`;
  }

  function send(message, options) {
    return ZiliRuntime.send(message, options);
  }

  function removeScreenshotOverlay() {
    state.screenshotOverlay?.remove();
    state.screenshotOverlay = null;
  }

  function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("screenshot_decode_failed"));
      image.src = dataUrl;
    });
  }

  async function cropScreenshotDataUrl(dataUrl, rect, viewport) {
    const image = await imageFromDataUrl(dataUrl);
    const plan = ZiliScreenshot.cropPlan(rect, viewport, {
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    if (!plan) throw new Error("screenshot_region_too_small");
    const canvas = document.createElement("canvas");
    canvas.width = plan.outputWidth;
    canvas.height = plan.outputHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("screenshot_crop_failed");
    context.drawImage(
      image,
      plan.sx,
      plan.sy,
      plan.sourceWidth,
      plan.sourceHeight,
      0,
      0,
      plan.outputWidth,
      plan.outputHeight
    );
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  // Pasting a screenshot anywhere outside a text field recognises it, with no button needed.
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function shrinkImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return readImageFile(await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }));
  }

  async function recognizePastedImage(event) {
    if (!ZiliFeatureGates.isMasterEnabled(state.settings)) return;
    const target = event.composedPath?.()[0] || event.target;
    if (target?.closest?.("input, textarea, [contenteditable], #huashao-tone-root, #zili-companion-root")) return;
    if (target?.isContentEditable || document.activeElement?.closest?.("#huashao-tone-root, #zili-companion-root")) return;
    const file = [...(event.clipboardData?.items || [])]
      .find(item => /^image\/(?:png|jpeg|webp)$/i.test(item.type))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    try {
      const dataUrl = file.size > 6 * 1024 * 1024 ? await shrinkImage(file) : await readImageFile(file);
      await analyzeScreenshotImage(dataUrl, "clipboard");
    } catch {
      showStatus("这张图片读不出来，请换一张再试");
    }
  }

  async function analyzeScreenshotImage(imageDataUrl, source = "region", requestedMode = "auto") {
    if (!ZiliFeatureGates.isMasterEnabled(state.settings)) return;
    state.selectionInfo = null;
    state.lastSelection = "";
    state.currentVision = { imageDataUrl, source, requestedMode };
    showStatus("当前可识图模型正在看这张截图…", true, 0);
    const response = await send({
      type: "ANALYZE_SCREENSHOT",
      imageDataUrl,
      requestedMode,
      settingsOverride: candidateSettings()
    }, { timeoutMs: 35_000 });
    if (!ZiliFeatureGates.isMasterEnabled(state.settings)) return;
    if (!response?.ok || !response.output) {
      showStatus(requestedMode === "copy_text" && response?.ok
        ? "框选区域里没有识别出可复制的文字"
        : engineErrorMessage(response?.error));
      return;
    }
    state.currentVision = {
      imageDataUrl,
      source,
      requestedMode,
      result: response
    };
    showComment({
      ...response,
      mode: requestedMode === "copy_text" ? "explain" : response.mode || "explain",
      intent: requestedMode === "copy_text" ? "识字结果 · 点击复制" : response.intent,
      copyText: requestedMode === "copy_text",
      vision: true
    });
  }

  async function finishScreenshotSelection(rect, viewport, requestedMode = "auto") {
    removeScreenshotOverlay();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const capture = await send({ type: "CAPTURE_VISIBLE_TAB" });
    if (!capture?.ok || !capture.dataUrl) {
      showStatus(engineErrorMessage(capture?.error));
      return;
    }
    try {
      const cropped = await cropScreenshotDataUrl(capture.dataUrl, rect, viewport);
      await analyzeScreenshotImage(cropped, "region", requestedMode);
    } catch (error) {
      showStatus(/too_small/.test(error?.message || "")
        ? "框选范围太小了，请重新框选"
        : "这次截图没有裁好，请再试一次");
    }
  }

  function startScreenshotSelection(requestedMode = "auto") {
    if (!ZiliFeatureGates.isMasterEnabled(state.settings)) {
      return { ok: false, error: "disabled" };
    }
    removeScreenshotOverlay();
    hideHost();
    state.selectionInfo = null;
    state.currentVision = null;
    const overlay = document.createElement("div");
    overlay.id = "zili-screenshot-overlay";
    overlay.innerHTML = [
      `<div class="zili-screenshot-hint">拖动框选要${requestedMode === "copy_text" ? "识字复制" : "识别"}的内容 · 按 Esc 取消</div>`,
      '<div class="zili-screenshot-box"></div>'
    ].join("");
    document.documentElement.appendChild(overlay);
    state.screenshotOverlay = overlay;
    const box = overlay.querySelector(".zili-screenshot-box");
    let start = null;

    const onPointerMove = event => {
      if (!start) return;
      const left = Math.min(start.x, event.clientX);
      const top = Math.min(start.y, event.clientY);
      const width = Math.abs(event.clientX - start.x);
      const height = Math.abs(event.clientY - start.y);
      Object.assign(box.style, {
        display: "block",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    const onPointerUp = event => {
      if (!start) return;
      const rect = {
        x: Math.min(start.x, event.clientX),
        y: Math.min(start.y, event.clientY),
        width: Math.abs(event.clientX - start.x),
        height: Math.abs(event.clientY - start.y)
      };
      cleanup();
      finishScreenshotSelection(rect, {
        width: window.innerWidth,
        height: window.innerHeight
      }, requestedMode);
    };
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      cleanup();
      removeScreenshotOverlay();
      showStatus("已取消截图", false, 1400);
    };
    overlay.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY };
      onPointerMove(event);
    }, { once: true });
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    return { ok: true };
  }

  function syncHostTheme() {
    if (state.host) state.host.dataset.theme = state.settings.theme;
    if (state.companionHost) {
      state.companionHost.dataset.theme = state.settings.theme;
      const img = state.companionShadow?.querySelector(".zili-companion-sticker img");
      if (img) img.src = companionAssetUrl(state.settings.theme);
    }
  }

  function speakCompanionTip() {
    const now = Date.now();
    if (now - (state.companionTipAt || 0) < 8000) return;
    if (state.companionDrag || state.host?.classList.contains("is-visible")) return;
    if (state.companionShadow?.querySelector(".companion-chat:not([hidden])")) return;
    state.companionTipAt = now;
    if (!state.companionTips?.length) state.companionTips = COMPANION_TIPS.slice().sort(() => Math.random() - .5);
    companionSpeak(state.companionTips.pop(), 4200);
  }

  function closeCompanionMenu() {
    const menu = state.companionShadow?.querySelector(".zili-companion-menu");
    const close = state.companionShadow?.querySelector(".zili-companion-close");
    if (menu) menu.hidden = true;
    close?.setAttribute("aria-expanded", "false");
  }

  function companionSpeak(text, duration = 3600) {
    if (!state.settingsLoaded || !state.settings.enabled || !state.settings.floatingCompanion) return;
    ensureCompanion();
    const bubble = state.companionShadow?.querySelector(".zili-companion-speech");
    if (!bubble) return;
    const next = String(text || "").replace(/\s+/g, " ").trim();
    bubble.textContent = next.length > 24 ? `${next.slice(0, 23)}…` : (next || "划一下，我帮你看");
    bubble.classList.add("is-speaking");
    requestAnimationFrame(positionCompanion);
    clearTimeout(state.companionSpeechTimer);
    if (duration > 0) {
      state.companionSpeechTimer = setTimeout(() => {
        bubble.textContent = "划一下，我帮你看";
        bubble.classList.remove("is-speaking");
        requestAnimationFrame(positionCompanion);
      }, duration);
    }
  }

  async function saveSettingsPatch(patch) {
    const next = ToneOptimizer.normalizeSettings({ ...state.settings, ...patch });
    const response = await send({ type: "SAVE_SETTINGS", settings: next });
    if (!response?.ok) {
      companionSpeak("没保存上，再试一下");
      return false;
    }
    state.settings = ToneOptimizer.normalizeSettings(response.settings || next);
    state.settingsLoaded = true;
    syncHostTheme();
    cancelDisabledFeatures(state.settings);
    syncCompanionVisibility();
    return true;
  }

  function companionBounds() {
    const rect = state.companionHost?.getBoundingClientRect();
    const width = Math.max(82, rect?.width || 210);
    const height = Math.max(72, rect?.height || 92);
    return {
      minLeft: 8,
      minTop: 8,
      maxLeft: Math.max(8, window.innerWidth - width - 8),
      maxTop: Math.max(8, window.innerHeight - height - 8)
    };
  }

  function positionCompanion() {
    if (!state.companionHost) return;
    state.companionChat?.position();
    if (!state.companionPosition) {
      state.companionHost.style.removeProperty("left");
      state.companionHost.style.removeProperty("top");
      state.companionHost.style.right = "18px";
      state.companionHost.style.bottom = "16px";
      return;
    }
    const bounds = companionBounds();
    const x = Math.max(0, Math.min(1, Number(state.companionPosition.x) || 0));
    const y = Math.max(0, Math.min(1, Number(state.companionPosition.y) || 0));
    const left = bounds.minLeft + (bounds.maxLeft - bounds.minLeft) * x;
    const top = bounds.minTop + (bounds.maxTop - bounds.minTop) * y;
    state.companionHost.style.right = "auto";
    state.companionHost.style.bottom = "auto";
    state.companionHost.style.left = `${Math.round(left)}px`;
    state.companionHost.style.top = `${Math.round(top)}px`;
  }

  function setCompanionPixelPosition(left, top) {
    const bounds = companionBounds();
    const nextLeft = Math.max(bounds.minLeft, Math.min(Number(left) || bounds.minLeft, bounds.maxLeft));
    const nextTop = Math.max(bounds.minTop, Math.min(Number(top) || bounds.minTop, bounds.maxTop));
    state.companionPosition = {
      x: bounds.maxLeft === bounds.minLeft ? 0 : (nextLeft - bounds.minLeft) / (bounds.maxLeft - bounds.minLeft),
      y: bounds.maxTop === bounds.minTop ? 0 : (nextTop - bounds.minTop) / (bounds.maxTop - bounds.minTop)
    };
    positionCompanion();
    if (state.assistantAttached) positionHost();
  }

  function persistCompanionPosition() {
    if (!state.companionPosition) return;
    void chrome.storage.local.set({
      [COMPANION_POSITION_KEY]: state.companionPosition
    }).catch(() => {});
  }

  async function loadCompanionPosition() {
    try {
      const stored = await chrome.storage.local.get(COMPANION_POSITION_KEY);
      const candidate = stored?.[COMPANION_POSITION_KEY];
      if (
        candidate
        && Number.isFinite(Number(candidate.x))
        && Number.isFinite(Number(candidate.y))
      ) {
        state.companionPosition = {
          x: Math.max(0, Math.min(1, Number(candidate.x))),
          y: Math.max(0, Math.min(1, Number(candidate.y)))
        };
      }
    } catch (_) {
      state.companionPosition = null;
    }
  }

  async function resetCompanionPosition() {
    state.companionPosition = null;
    positionCompanion();
    if (state.assistantAttached) positionHost();
    try {
      await chrome.storage.local.remove(COMPANION_POSITION_KEY);
    } catch (_) {}
    companionSpeak("已经回到右下角了");
  }

  function enableCompanionDragging() {
    const sticker = state.companionShadow?.querySelector(".zili-companion-sticker");
    const shell = state.companionShadow?.querySelector(".zili-companion");
    if (!sticker || !shell) return;

    const finishDrag = event => {
      const drag = state.companionDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (sticker.hasPointerCapture?.(event.pointerId)) sticker.releasePointerCapture(event.pointerId);
      state.companionDrag = null;
      shell.classList.remove("is-dragging");
      if (!drag.moved || !state.companionPosition) return;
      state.companionSuppressClick = true;
      setTimeout(() => {
        state.companionSuppressClick = false;
      }, 320);
      persistCompanionPosition();
      companionSpeak("位置记住了，双击我可以回右下角");
    };

    sticker.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      closeCompanionMenu();
      const rect = state.companionHost.getBoundingClientRect();
      state.companionDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false
      };
      sticker.setPointerCapture?.(event.pointerId);
      shell.classList.add("is-dragging");
    });
    sticker.addEventListener("pointermove", event => {
      const drag = state.companionDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
      drag.moved = true;
      event.preventDefault();
      setCompanionPixelPosition(drag.startLeft + deltaX, drag.startTop + deltaY);
    });
    sticker.addEventListener("pointerup", finishDrag);
    sticker.addEventListener("pointercancel", finishDrag);
    sticker.addEventListener("dblclick", event => {
      event.preventDefault();
      state.companionSuppressClick = false;
      void resetCompanionPosition();
    });
  }

  function ensureCompanion() {
    if (state.companionHost) {
      syncHostTheme();
      return;
    }
    state.companionHost = document.createElement("div");
    state.companionHost.id = "zili-companion-root";
    state.companionHost.dataset.ziliVersion = CONTENT_VERSION;
    state.companionHost.dataset.theme = state.settings.theme;
    document.documentElement.appendChild(state.companionHost);
    state.companionShadow = state.companionHost.attachShadow({ mode: "closed" });
    globalThis.ZiliKeyGuard?.register(state.companionHost, state.companionShadow);
    state.companionShadow.innerHTML = `
      <style>
        :host { --zili-accent: #557fa8; --zili-accent-strong: #426b91; --zili-soft: rgba(247,250,251,.97); --zili-ink: #2b4050; }
        :host([data-theme="sage"]) { --zili-accent: #3f7158; --zili-accent-strong: #2f5c46; --zili-soft: rgba(249,251,247,.97); --zili-ink: #293c34; }
        :host([data-theme="sand"]) { --zili-accent: #aa704d; --zili-accent-strong: #87583d; --zili-soft: rgba(255,251,245,.97); --zili-ink: #493b32; }
        :host([data-theme="ink"]) { --zili-accent: #607a98; --zili-accent-strong: #445d78; --zili-soft: rgba(252,251,248,.97); --zili-ink: #2b3948; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .zili-companion { position: relative; display: flex; align-items: flex-end; gap: 7px; min-height: 80px; padding: 16px 11px 4px 3px; font-family: -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
        .zili-companion-speech { position: relative; max-width: 118px; margin-bottom: 22px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--zili-accent) 22%, transparent); border-radius: 13px 13px 4px 13px; color: var(--zili-ink); background: var(--zili-soft); box-shadow: 0 8px 22px rgba(38,56,72,.12); font-size: 11px; font-weight: 620; line-height: 1.35; white-space: normal; transition: transform .18s ease, opacity .18s ease, visibility .18s ease; }
        .zili-companion-speech::after { content: ""; position: absolute; right: -5px; bottom: 5px; width: 9px; height: 9px; border-right: 1px solid color-mix(in srgb, var(--zili-accent) 22%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--zili-accent) 22%, transparent); background: var(--zili-soft); transform: rotate(-45deg); }
        .zili-companion-speech { position: absolute; right: 98px; bottom: 12px; width: max-content; opacity: 0; visibility: hidden; pointer-events: none; }
        .zili-companion-speech.is-speaking { opacity: 1; visibility: visible; transform: translateY(-2px); animation: zili-speech-pop .32s cubic-bezier(.34,1.56,.64,1); }
        @keyframes zili-speech-pop { from { opacity: 0; transform: translateY(6px) scale(.9); } to { opacity: 1; transform: translateY(-2px) scale(1); } }
        .zili-companion-sticker { position: relative; width: 82px; height: 72px; padding: 0; border: 0; outline: 0; background: transparent; cursor: grab; touch-action: none; user-select: none; animation: zili-companion-float 3.4s ease-in-out infinite; transform-origin: 50% 82%; }
        .zili-companion-sticker::after { content: ""; position: absolute; left: 16px; right: 8px; bottom: 1px; height: 9px; border-radius: 50%; background: rgba(34,49,61,.16); filter: blur(4px); animation: zili-companion-shadow 3.4s ease-in-out infinite; }
        .zili-companion-sticker img { position: relative; z-index: 1; display: block; width: 82px; height: 72px; object-fit: contain; image-rendering: auto; filter: drop-shadow(0 5px 7px rgba(34,49,61,.14)); transition: transform .28s cubic-bezier(.34,1.56,.64,1), filter .28s ease; }
        .zili-companion-sticker:hover img { transform: translateY(-5px) scale(1.06) rotate(-2deg); filter: drop-shadow(0 10px 12px rgba(34,49,61,.2)); }
        .zili-companion-close { position: absolute; z-index: 4; top: 0; right: 1px; display: grid; width: 22px; height: 22px; padding: 0; place-items: center; border: 1px solid rgba(54,76,91,.12); border-radius: 50%; color: #716b63; background: rgba(255,255,255,.96); box-shadow: 0 5px 14px rgba(42,59,70,.12); cursor: pointer; opacity: 0; transform: translateY(3px) scale(.94); pointer-events: none; transition: opacity .16s ease, transform .16s ease; font-size: 15px; line-height: 1; }
        .zili-companion:hover .zili-companion-close, .zili-companion:focus-within .zili-companion-close { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
        .zili-companion-menu { position: absolute; z-index: 5; right: 4px; bottom: 79px; width: 146px; padding: 5px; border: 1px solid rgba(54,76,91,.14); border-radius: 12px; color: var(--zili-ink); background: rgba(255,255,255,.98); box-shadow: 0 14px 34px rgba(42,59,70,.18); }
        .zili-companion-menu[hidden] { display: none; }
        .zili-companion-menu button { display: block; width: 100%; padding: 8px 9px; border: 0; border-radius: 8px; color: var(--zili-ink); background: transparent; cursor: pointer; font-size: 11px; text-align: left; }
        .zili-companion-menu button:hover, .zili-companion-menu button:focus-visible { outline: 0; background: color-mix(in srgb, var(--zili-accent) 12%, white); }
        .zili-companion-menu [data-companion-action="disable"] { color: #9a4c43; }
        .zili-companion.is-card-attached .zili-companion-speech { opacity: 0; visibility: hidden; transform: translateY(2px) scale(.96); pointer-events: none; }
        .zili-companion.is-card-attached .zili-companion-sticker, .zili-companion.is-card-attached .zili-companion-close, .zili-companion.is-card-attached .zili-companion-menu { pointer-events: auto; }
        .zili-companion.is-dragging .zili-companion-sticker, .zili-companion.is-dragging .zili-companion-sticker::after { animation: none; }
        .zili-companion.is-dragging .zili-companion-sticker { cursor: grabbing; }
        @keyframes zili-companion-float { 0%,100% { transform: translateY(0) rotate(-.6deg); } 50% { transform: translateY(-6px) rotate(.6deg); } }
        @keyframes zili-companion-shadow { 0%,100% { transform: scaleX(1); opacity: .72; } 50% { transform: scaleX(.82); opacity: .45; } }
        @media (prefers-reduced-motion: reduce) {
          .zili-companion-sticker, .zili-companion-sticker::after { animation: none; }
          .zili-companion-speech, .zili-companion-close { transition: none; }
          .zili-companion-sticker img, .zili-companion-speech { transition: none; animation: none; }
        }
        @media (max-width: 520px) { .zili-companion-speech { display: none; } }
      </style>
      <aside class="zili-companion" aria-label="字里漂浮助手">
        <div class="zili-companion-speech" role="status" aria-live="polite">划一下，我帮你看</div>
        <button class="zili-companion-sticker" type="button" aria-label="字里暹罗猫助手" title="拖动调整位置，双击回到右下角"><img src="${companionAssetUrl(state.settings.theme)}" alt="" draggable="false"></button>
        <button class="zili-companion-close" type="button" aria-label="关闭选项" aria-haspopup="menu" aria-expanded="false">×</button>
        <div class="zili-companion-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-companion-action="hide">只关闭漂浮框</button>
          <button type="button" role="menuitem" data-companion-action="disable">关闭字里</button>
        </div>
      </aside>`;

    const close = state.companionShadow.querySelector(".zili-companion-close");
    const menu = state.companionShadow.querySelector(".zili-companion-menu");
    close.addEventListener("click", event => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      close.setAttribute("aria-expanded", String(open));
    });
    state.companionShadow.querySelector(".zili-companion-sticker").addEventListener("pointerenter", speakCompanionTip);
    state.companionShadow.querySelector(".zili-companion-sticker").addEventListener("click", () => {
      if (state.companionSuppressClick) {
        state.companionSuppressClick = false;
        return;
      }
      closeCompanionMenu();
      clearTimeout(state.companionSpeechTimer);
      state.companionShadow?.querySelector(".zili-companion-speech")?.classList.remove("is-speaking");
      state.host?.classList.remove('is-visible');
      syncAssistantAttachment();
      void state.companionChat.toggle();
    });
    state.companionShadow.querySelector('[data-companion-action="hide"]').addEventListener("click", async () => {
      closeCompanionMenu();
      await saveSettingsPatch({ floatingCompanion: false });
    });
    state.companionShadow.querySelector('[data-companion-action="disable"]').addEventListener("click", async () => {
      closeCompanionMenu();
      await saveSettingsPatch({ enabled: false });
    });
    state.companionChat = globalThis.ZiliCompanionChat.attach(state.companionShadow, {
      send,
      hasResult: () => Boolean(state.currentComment || state.currentRewrite),
      showResult: () => revealHost(),
      startCapture: () => startScreenshotSelection("auto"),
      writeDraft: writeDraftToPage
    });
    enableCompanionDragging();
  }

  function syncCompanionVisibility() {
    if (!state.settingsLoaded) return;
    const visible = state.settings.enabled !== false && state.settings.floatingCompanion !== false;
    if (!visible) {
      state.companionChat?.close();
      clearTimeout(state.companionSpeechTimer);
      closeCompanionMenu();
      state.companionHost?.classList.remove("is-visible");
      syncAssistantAttachment();
      positionHost();
      return;
    }
    ensureCompanion();
    state.companionHost.classList.add("is-visible");
    syncAssistantAttachment();
    requestAnimationFrame(() => {
      positionCompanion();
      if (state.assistantAttached) positionHost();
    });
  }

  function syncAssistantAttachment(force) {
    const hostVisible = state.host?.classList.contains("is-visible") === true;
    const companionVisible = state.companionHost?.classList.contains("is-visible") === true;
    const attached = typeof force === "boolean"
      ? force
      : Boolean(hostVisible && companionVisible && state.settings.enabled !== false && state.settings.floatingCompanion !== false);
    if (attached && !state.assistantAttached) state.panelPosition = null;
    state.assistantAttached = attached;
    state.host?.classList.toggle("is-companion-card", attached);
    state.shadow?.querySelector(".zili-card")?.classList.toggle("is-companion-card", attached);
    const header = state.shadow?.querySelector(".zili-head");
    if (header) {
      header.title = attached
        ? "拖动我和猫咪，双击回到右下角"
        : "拖动调整位置，双击恢复自动跟随";
    }
    state.companionHost?.classList.toggle("is-card-attached", attached);
    state.companionShadow?.querySelector(".zili-companion")?.classList.toggle("is-card-attached", attached);
    if (!attached && state.host) {
      state.host.removeAttribute("data-tail");
      state.host.removeAttribute("data-assistant-placement");
    }
    return attached;
  }

  function revealHost() {
    if (!state.host) return;
    state.companionChat?.close();
    if (!state.shadow.querySelector('.zili-conversation-tabs')) {
      const tabs = document.createElement('div');
      tabs.className = 'zili-conversation-tabs';
      // 和小猫面板同一排标签：对话 / 功能 / 收纳 / 当前结果，点前三个回到小猫面板对应的页。
      for (const [view, label] of [['chat', '对话'], ['tools', '功能'], ['collect', '收纳']]) {
        if (view === 'collect' && !globalThis.ZiliCollectPanel) continue;
        const tab = document.createElement('button');
        tab.type = 'button'; tab.textContent = label;
        tab.onclick = () => { state.host.classList.remove('is-visible'); syncAssistantAttachment(); void state.companionChat?.open(view); };
        tabs.append(tab);
      }
      const result = document.createElement('span'); result.textContent = '当前结果'; result.className = 'is-current';
      tabs.append(result);
      state.shadow.querySelector('.zili-head').after(tabs);
    }
    state.host.classList.add("is-visible");
    syncAssistantAttachment();
    positionCompanion();
    positionHost();
  }

  function ensureHost() {
    if (state.host) {
      syncHostTheme();
      return;
    }
    state.host = document.createElement("div");
    state.host.id = "huashao-tone-root";
    state.host.dataset.ziliVersion = CONTENT_VERSION;
    state.host.dataset.theme = state.settings.theme;
    document.documentElement.appendChild(state.host);
    state.shadow = state.host.attachShadow({ mode: "closed" });
    globalThis.ZiliKeyGuard?.register(state.host, state.shadow);
    state.shadow.innerHTML = `
      <style>
        :host { --zili-accent: #557fa8; --zili-accent-strong: #426b91; --zili-accent-soft: #edf3f7; --zili-card-bg: rgba(248,250,248,.98); --zili-text: #263848; }
        :host([data-theme="sage"]) { --zili-accent: #3f7158; --zili-accent-strong: #2f5c46; --zili-accent-soft: #e7f0e9; --zili-card-bg: rgba(249,251,247,.98); --zili-text: #293c34; }
        :host([data-theme="sand"]) { --zili-accent: #aa704d; --zili-accent-strong: #87583d; --zili-accent-soft: #f6eadc; --zili-card-bg: rgba(255,251,245,.98); --zili-text: #493b32; }
        :host([data-theme="ink"]) { --zili-accent: #607a98; --zili-accent-strong: #445d78; --zili-accent-soft: #e9eef1; --zili-card-bg: rgba(252,251,248,.98); --zili-text: #2b3948; }
        .zili-card { position: relative; isolation: isolate; color: #263848; overflow: visible; border: 1px solid rgba(54,76,91,.14); border-radius: 17px; background: rgba(248,250,248,.98); box-shadow: 0 18px 48px rgba(42,59,70,.18); backdrop-filter: blur(16px); font-family: -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
        .zili-card > :not(.zili-card-tail) { position: relative; z-index: 1; }
        .zili-card-tail { position: absolute; z-index: 0; display: none; width: 14px; height: 14px; border: 1px solid rgba(54,76,91,.14); background: var(--zili-card-bg); transform: rotate(45deg); }
        :host(.is-companion-card) .zili-card-tail { display: block; }
        :host(.is-companion-card) .zili-cat { display: none; }
        :host(.is-companion-card) .zili-card { animation: zili-card-speak-in .18s cubic-bezier(.16,1,.3,1); }
        :host([data-tail="bottom-right"]) .zili-card-tail { right: 17px; bottom: -7px; border-top: 0; border-left: 0; }
        :host([data-tail="bottom-left"]) .zili-card-tail { left: 17px; bottom: -7px; border-top: 0; border-left: 0; }
        :host([data-tail="top-right"]) .zili-card-tail { right: 17px; top: -7px; border-right: 0; border-bottom: 0; }
        :host([data-tail="top-left"]) .zili-card-tail { left: 17px; top: -7px; border-right: 0; border-bottom: 0; }
        .zili-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px 9px; cursor: grab; user-select: none; touch-action: none; }
        .zili-head.is-dragging { cursor: grabbing; }
        .zili-brand { display: flex; align-items: center; gap: 6px; color: #334858; font-size: 12px; font-weight: 720; }
        .zili-cat { width: 28px; height: 28px; border: 1px solid rgba(85,127,168,.18); border-radius: 10px; object-fit: cover; object-position: center 26%; }
        .zili-mark { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50% 50% 45% 55%; color: #fff; background: #557fa8; font-size: 11px; }
        button { font: inherit; cursor: pointer; }
        .zili-close { width: 24px; height: 24px; border: 0; color: #7d776d; background: transparent; font-size: 19px; line-height: 1; }
        .zili-status { padding: 0 14px 11px; color: #6f695f; font-size: 11px; line-height: 1.5; }
        .zili-status.is-busy { color: #426b91; }
        .zili-method-context { margin: -2px 12px 10px; padding: 9px 10px; border: 1px solid rgba(85,127,168,.14); border-radius: 10px; color: #536575; background: var(--zili-accent-soft); font-size: 10px; line-height: 1.48; }
        .zili-method-context[hidden] { display: none; }
        .zili-method-picks { display: grid; gap: 6px; margin: 0 14px 12px; }
        .zili-method-picks[hidden] { display: none; }
        .zili-method-picks button { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 10px; padding: 10px 12px; border: 1px solid rgba(85,127,168,.16); border-radius: 12px; color: var(--zili-text, #263848); background: #fff; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
        .zili-method-picks button:hover { border-color: rgba(85,127,168,.45); }
        .zili-method-picks button strong { font-size: 13px; font-weight: 600; }
        .zili-method-picks button span { grid-column: 1; color: #7d8996; font-size: 12px; line-height: 1.5; }
        .zili-method-picks button i { grid-column: 2; grid-row: 1 / span 2; box-sizing: border-box; width: 16px; height: 16px; border: 1.5px solid rgba(85,127,168,.3); border-radius: 50%; }
        .zili-method-picks button[aria-pressed="true"] { border-color: var(--zili-accent, #557fa8); background: var(--zili-accent-soft, #eef3f8); }
        .zili-method-picks button[aria-pressed="true"] i { border: 4.5px solid var(--zili-accent, #557fa8); background: #fff; }
        .zili-card[data-mode="method"] .zili-output { position: relative; max-height: 7.8em; overflow: hidden; font-size: 12.5px; color: #5d6a75; }
        .zili-card[data-mode="method"] .zili-output::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2.6em; background: linear-gradient(transparent, #fff); }
        .zili-card[data-mode="method"] .zili-output.is-expanded { max-height: 40vh; overflow: auto; }
        .zili-card[data-mode="method"] .zili-output.is-expanded::after { display: none; }
        .zili-output-toggle { display: block; margin: -6px 14px 10px auto; padding: 2px 4px; border: 0; color: var(--zili-accent-strong, #426b91); background: none; font: inherit; font-size: 12px; cursor: pointer; }
        .zili-output-toggle[hidden], .zili-card:not([data-mode="method"]) .zili-output-toggle { display: none; }
        .zili-route { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -4px 14px 8px; color: #8a8276; font-size: 10px; }
        .zili-route[hidden] { display: none; }
        .zili-route-select { min-width: 52px; padding: 3px 5px; border: 1px solid rgba(85,127,168,.20); border-radius: 7px; outline: 0; color: #426b91; background: #fff; font-size: 10px; font-weight: 680; }
        .zili-route-select option:disabled { color: #aaa; }
        .zili-vision-route { display: flex; align-items: center; gap: 7px; margin: -4px 14px 9px; color: #8a8276; font-size: 10px; }
        .zili-vision-route[hidden] { display: none; }
        .zili-vision-route select { flex: 1; min-width: 0; padding: 5px 7px; border: 1px solid rgba(85,127,168,.20); border-radius: 8px; outline: 0; color: #426b91; background: #fff; font-size: 10px; font-weight: 680; }
        .zili-vision-preview { display: block; width: calc(100% - 24px); max-height: 116px; margin: 0 12px 9px; border: 1px solid rgba(48,43,35,.09); border-radius: 11px; object-fit: cover; background: #ece9e1; }
        .zili-vision-preview[hidden] { display: none; }
        .zili-output { margin: 0 12px 10px; padding: 12px; border: 1px solid rgba(48,43,35,.09); border-radius: 12px; color: #302d28; background: #fff; font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
        .zili-meta { display: flex; justify-content: space-between; padding: 0 14px 8px; color: #8a8276; font-size: 10px; }
        .zili-footer { display: flex; gap: 8px; padding: 0 12px 12px; }
        .zili-apply { flex: 1; padding: 9px; border: 0; border-radius: 10px; color: #fff; background: #557fa8; font-size: 11px; font-weight: 680; }
        .zili-copy { padding: 9px 11px; border: 1px solid rgba(85,127,168,.22); border-radius: 10px; color: #426b91; background: transparent; font-size: 11px; font-weight: 650; }
        .zili-restore-row { display: flex; align-items: center; justify-content: space-between; gap: 9px; margin: -2px 12px 11px; padding: 8px 9px; border: 1px solid rgba(85,127,168,.14); border-radius: 10px; color: #746d62; background: var(--zili-accent-soft); font-size: 9px; }
        .zili-restore-row[hidden] { display: none; }
        .zili-restore-original { padding: 5px 9px; border: 1px solid rgba(85,127,168,.22); border-radius: 8px; color: var(--zili-accent-strong); background: #fff; font-size: 9px; font-weight: 680; }
        .zili-verify-details { display: grid; gap: 7px; margin: -2px 12px 10px; }
        .zili-verify-details[hidden] { display: none; }
        .zili-verify-block { padding: 9px 10px; border: 1px solid rgba(85,127,168,.12); border-radius: 10px; background: #f1f5f7; }
        .zili-verify-block strong { display: block; margin-bottom: 3px; color: #607d92; font-size: 9px; }
        .zili-verify-block p, .zili-verify-block ul { margin: 0; color: #465967; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }
        .zili-verify-block ul { padding-left: 15px; }
        .zili-verify-block a { color: #426b91; overflow-wrap: anywhere; }
        .zili-usage { margin: -4px 12px 10px; color: #837c71; }
        .zili-usage summary { display: flex; align-items: center; justify-content: space-between; padding: 4px 1px; list-style: none; cursor: pointer; font-size: 9px; }
        .zili-usage summary::-webkit-details-marker { display: none; }
        .zili-usage-leading { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
        .zili-quick-regenerate { display: inline-grid; width: 22px; height: 22px; place-items: center; padding: 0; border: 1px solid rgba(85,127,168,.22); border-radius: 50%; color: var(--zili-accent-strong); background: #fff; font-size: 15px; font-weight: 700; line-height: 1; }
        .zili-quick-regenerate:hover { border-color: var(--zili-accent); color: #fff; background: var(--zili-accent); }
        .zili-quick-regenerate:focus-visible { outline: 2px solid var(--zili-accent); outline-offset: 2px; }
        .zili-quick-regenerate[hidden] { display: none; }
        .zili-usage summary small { color: #9b9489; font-size: 9px; }
        .zili-usage p { margin: 4px 0 0; color: #958e83; font-size: 9px; line-height: 1.45; }
        .zili-followup { margin: 0 12px 12px; border-top: 1px solid rgba(48,43,35,.1); color: #564f45; }
        .zili-followup summary { display: flex; align-items: center; gap:9px; min-height:56px; box-sizing:border-box; margin-top:12px; padding:12px 14px; border-radius:10px; background:var(--zili-accent-soft); list-style: none; cursor: pointer; font-size:16px; font-weight:700; color:var(--zili-accent-strong); }
        .zili-followup summary::after { content:'⌄'; font-size:20px; }
        .zili-followup[open] summary::after { content:'⌃'; }
        .zili-followup summary small { display:block; flex:1; }
        .zili-followup summary::-webkit-details-marker { display: none; }
        .zili-followup summary small { color:var(--zili-accent-strong); font-size:13px; font-weight:400; line-height:1.5; }
        .zili-followup summary:focus-visible { outline:2px solid var(--zili-accent-strong); outline-offset:2px; }
        .zili-followup-body { display: grid; gap:10px; padding-top:10px; }
        .zili-followup-history { display: grid; gap:8px; max-height:220px; overflow:auto; }
        .zili-followup-message { padding:11px 12px; border-radius:10px; color:#536575; background:var(--zili-accent-soft); font-size:15px; line-height:1.6; white-space:pre-wrap; }
        .zili-followup-message.is-user { margin-left:26px; color:#fff; background:var(--zili-accent); }
        .zili-followup-input { box-sizing:border-box; width:100%; resize:vertical; min-height:92px; max-height:180px; padding:12px 13px; border:1px solid rgba(85,127,168,.2); border-radius:10px; outline:0; color:#302d28; background:#fff; font:inherit; font-size:16px; line-height:1.55; }
        .zili-followup-input:focus { border-color: var(--zili-accent); box-shadow: 0 0 0 3px var(--zili-accent-soft); }
        .zili-followup-attachment { display:flex; align-items:center; gap:7px; min-height:28px; color:#837c71; font-size:10px; }
        .zili-followup-attachment[hidden] { display:none; }
        .zili-followup-add-image, .zili-followup-remove-image { border:1px solid rgba(85,127,168,.22); border-radius:8px; color:var(--zili-accent-strong); background:#fff; font-size:10px; font-weight:680; }
        .zili-followup-add-image { min-height:28px; padding:5px 9px; }
        .zili-followup-add-image:hover { border-color:var(--zili-accent); background:var(--zili-accent-soft); }
        .zili-followup-image-preview { width:28px; height:28px; border-radius:6px; object-fit:cover; }
        .zili-followup-image-preview[hidden], .zili-followup-remove-image[hidden] { display:none; }
        .zili-followup-remove-image { width:24px; height:24px; padding:0; font-size:15px; line-height:1; }
        .zili-followup-image-state.is-error { color:#a94716; }
        .zili-followup-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; color:#837c71; font-size:12px; line-height:1.45; }
        .zili-followup-send { min-height:44px; padding:9px 16px; border:0; border-radius:9px; color:#fff; background:var(--zili-accent); font-size:14px; font-weight:680; }
        .zili-tune { margin: 0 12px 12px; border-top: 1px solid rgba(48,43,35,.1); color: #564f45; }
        .zili-tune summary { display: flex; align-items: center; justify-content: space-between; padding: 10px 1px 2px; list-style: none; cursor: pointer; color: #4c483f; font-size: 11px; font-weight: 680; }
        .zili-tune summary::-webkit-details-marker { display: none; }
        .zili-tune summary span { color: #8c857a; font-size: 10px; font-weight: 550; }
        .zili-tune[open] summary { padding-bottom: 10px; }
        .zili-tune-body { display: grid; gap: 9px; padding-bottom: 2px; }
        .zili-tune-note { margin: -4px 0 0; color: #8c857a; font-size: 9px; line-height: 1.45; }
        .zili-tune-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .zili-tune-preset { min-height: 32px; padding: 6px 7px; border: 1px solid rgba(85,127,168,.18); border-radius: 8px; color: #536575; background: #fff; font-size: 10px; text-align: left; }
        .zili-tune-preset.is-selected { border-color: #557fa8; color: #426b91; background: #edf3f7; font-weight: 700; }
        .zili-tune-slider { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; align-items: center; color: #746d62; font-size: 10px; }
        .zili-tune-slider output { color: #426b91; font-weight: 700; }
        .zili-tune-slider input { grid-column: 1 / -1; width: 100%; accent-color: #557fa8; }
        .zili-regenerate { width: 100%; margin-top: 2px; padding: 9px; border: 1px solid rgba(85,127,168,.22); border-radius: 9px; color: #fff; background: #557fa8; font-size: 11px; font-weight: 700; }
        .zili-manual { display: none; padding: 0 12px 12px; }
        .zili-manual-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .zili-manual-mode { min-width: 0; padding: 9px 7px; border: 1px solid rgba(85,127,168,.22); border-radius: 10px; color: #426b91; background: #fff; font-size: 11px; font-weight: 700; }
        .zili-manual-mode.is-selected { color: #fff; background: #557fa8; }
        .zili-manual-length { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #8a8276; font-size: 10px; }
        .zili-manual-length[hidden] { display: none; }
        .zili-manual-length span { margin-right: auto; }
        .zili-manual-length button { min-width: 32px; padding: 4px 8px; border: 1px solid rgba(85,127,168,.18); border-radius: 999px; color: #667786; background: #fff; font-size: 10px; }
        .zili-manual-length button.is-selected { border-color: #557fa8; color: #fff; background: #557fa8; font-weight: 700; }
        .zili-manual-note { margin: 8px 1px 0; color: #8a8276; font-size: 9px; line-height: 1.4; }
        .zili-card[data-mode="status"] .zili-output, .zili-card[data-mode="status"] .zili-meta, .zili-card[data-mode="status"] .zili-footer, .zili-card[data-mode="status"] .zili-vision-preview { display: none; }
        .zili-card[data-mode="status"] .zili-usage { display: none; }
        .zili-card[data-mode="status"] .zili-followup { display: none; }
        .zili-card[data-mode="status"] .zili-tune { display: none; }
        .zili-card[data-mode="status"] .zili-route { display: none; }
        .zili-card[data-mode="status"] .zili-vision-route { display: none; }
        .zili-card[data-mode="status"] .zili-head { padding-bottom: 5px; }
        .zili-card[data-mode="status"] .zili-status { padding-bottom: 12px; }
        .zili-card[data-mode="manual"] .zili-output, .zili-card[data-mode="manual"] .zili-meta, .zili-card[data-mode="manual"] .zili-footer, .zili-card[data-mode="manual"] .zili-vision-preview { display: none; }
        .zili-card[data-mode="manual"] .zili-usage { display: none; }
        .zili-card[data-mode="manual"] .zili-followup { display: none; }
        .zili-card[data-mode="manual"] .zili-tune { display: none; }
        .zili-card[data-mode="manual"] .zili-route { display: none; }
        .zili-card[data-mode="manual"] .zili-vision-route { display: none; }
        .zili-card[data-mode="manual"] .zili-manual { display: block; }
        .zili-card[data-mode="method"] .zili-followup, .zili-card[data-mode="method"] .zili-tune, .zili-card[data-mode="method"] .zili-route, .zili-card[data-mode="method"] .zili-vision-route, .zili-card[data-mode="method"] .zili-vision-preview, .zili-card[data-mode="method"] .zili-usage { display: none; }
        .zili-card { color: var(--zili-text); background: var(--zili-card-bg); }
        .zili-mark, .zili-apply, .zili-regenerate, .zili-manual-mode.is-selected, .zili-manual-length button.is-selected { background: var(--zili-accent); }
        .zili-copy, .zili-status.is-busy, .zili-tune-slider output, .zili-manual-mode { color: var(--zili-accent-strong); }
        .zili-tune-preset.is-selected { border-color: var(--zili-accent); color: var(--zili-accent-strong); background: var(--zili-accent-soft); }
        .zili-tune-slider input { accent-color: var(--zili-accent); }
        @keyframes zili-card-speak-in { from { opacity: 0; transform: translateY(5px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        /* Card polish: one pill to switch task, lighter blocks, quiet secondary rows. */
        .zili-card { border-color: rgba(54,76,91,.10); border-radius: 18px; box-shadow: 0 16px 44px rgba(42,59,70,.16); }
        .zili-head { padding: 11px 12px 6px 14px; }
        .zili-brand { gap: 7px; font-size: 13px; }
        .zili-mark { width: 22px; height: 22px; border-radius: 8px; background: var(--zili-accent); }
        .zili-close { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; color: #8a929a; font-size: 18px; transition: background .15s, color .15s; }
        .zili-close:hover { color: var(--zili-text); background: rgba(0,0,0,.05); }
        .zili-status { padding: 0 14px 8px; color: #7d8790; font-size: 12px; }
        .zili-route, .zili-vision-route { display: flex; margin: 0 14px 10px; }
        .zili-route-select, .zili-vision-route select { flex: 0 0 auto; min-width: 0; padding: 5px 26px 5px 12px; border: 0; border-radius: 999px; outline: 0; color: var(--zili-accent-strong); background: var(--zili-accent-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23778'%3E%3Cpath d='M12 15L7.75 10.75 9.16 9.34 12 12.17 14.84 9.34 16.25 10.75z'/%3E%3C/svg%3E") no-repeat right 8px center / 14px; font-size: 12px; font-weight: 650; appearance: none; cursor: pointer; }
        .zili-route-select:focus-visible, .zili-vision-route select:focus-visible { box-shadow: 0 0 0 2px var(--zili-accent); }
        .zili-vision-preview { width: calc(100% - 28px); max-height: 104px; margin: 0 14px 10px; border: 0; border-radius: 12px; }
        .zili-meta { padding: 0 14px 6px; color: #8a929a; font-size: 11px; }
        .zili-output { margin: 0 14px 12px; padding: 12px 14px; border: 0; border-radius: 14px; color: var(--zili-text); box-shadow: 0 1px 3px rgba(0,0,0,.06); font-size: 14px; }
        .zili-footer { gap: 6px; padding: 0 14px 10px; }
        .zili-apply { padding: 10px; border-radius: 12px; background: var(--zili-accent); font-size: 13px; font-weight: 650; transition: transform .18s cubic-bezier(.34,1.56,.64,1), background .15s; }
        .zili-apply:hover { background: var(--zili-accent-strong); transform: translateY(-1px); }
        .zili-copy { padding: 10px 14px; border: 0; border-radius: 12px; color: var(--zili-accent-strong); background: var(--zili-accent-soft); font-size: 13px; transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
        .zili-copy:hover { transform: translateY(-1px); }
        .zili-card .zili-learning-panel { margin: 0 14px 6px !important; }
        .zili-card .zili-learning-panel button[data-action="remember"] { justify-self: start; padding: 2px 0; border: 0; border-radius: 0; color: var(--zili-accent-strong); background: transparent; font-size: 12px; }
        .zili-card .zili-learning-panel button[data-action="remember"]:hover { text-decoration: underline; }
        .zili-usage { margin: 0 14px 6px; }
        .zili-usage summary, .zili-usage summary small { font-size: 11px; }
        .zili-quick-regenerate { width: 24px; height: 24px; border: 0; background: var(--zili-accent-soft); font-size: 14px; }
        .zili-followup, .zili-tune { margin: 0 14px; border-top: 1px solid rgba(48,43,35,.08); }
        .zili-followup summary { min-height: 0; margin: 0; padding: 11px 1px; border-radius: 0; background: transparent; color: #4c483f; font-size: 12px; font-weight: 650; }
        .zili-followup summary small { flex: 1; color: #9aa1a8; font-size: 11px; font-weight: 400; }
        .zili-followup summary::after, .zili-followup[open] summary::after { content: ''; width: 7px; height: 7px; border-right: 1.5px solid #9aa1a8; border-bottom: 1.5px solid #9aa1a8; transform: rotate(45deg) translateY(-2px); transition: transform .2s; }
        .zili-followup[open] summary::after { transform: rotate(-135deg) translateY(-2px); }
        .zili-followup-body { padding: 0 0 12px; }
        .zili-followup-message { font-size: 13px; }
        .zili-followup-input { min-height: 64px; font-size: 13px; }
        .zili-followup-send { min-height: 34px; padding: 6px 14px; font-size: 13px; }
        .zili-followup-actions { font-size: 11px; }
        .zili-tune summary { padding: 11px 1px; font-size: 12px; font-weight: 650; }
        .zili-tune summary span { font-size: 11px; color: #9aa1a8; }
        .zili-tune { margin-bottom: 4px; }
        .zili-conversation-tabs { display: flex; gap: 2px; width: max-content; margin: 0 14px 8px; padding: 2px; border-radius: 10px; background: rgba(0,0,0,.04); font-size: 12px; }
        .zili-conversation-tabs > * { padding: 3px 12px; border: 0; border-radius: 8px; color: #7d8790; background: transparent; }
        .zili-conversation-tabs button:hover { color: var(--zili-text); }
        .zili-conversation-tabs .is-current { color: var(--zili-text); background: #fff; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
        @media (prefers-reduced-motion: reduce) { :host(.is-companion-card) .zili-card { animation: none; } }
      </style>
      <section class="zili-card" data-mode="status" aria-live="polite">
        <span class="zili-card-tail" aria-hidden="true"></span>
        <div class="zili-head" title="拖动调整位置，双击恢复自动跟随">
          <div class="zili-brand"><img class="zili-cat" src="${CAT_ASSET_URL}" alt=""><span class="zili-mark">字</span><span>字里</span></div>
          <button class="zili-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="zili-status">等你把意思写清楚一点</div>
        <div class="zili-method-context" hidden></div>
        <div class="zili-method-picks" hidden></div>
        <div class="zili-route" hidden>
          <select class="zili-route-select" aria-label="切换高亮任务">
            <option data-selection-mode="comment" value="comment">回复</option>
            <option data-selection-mode="explain" value="explain">讲解</option>
            <option data-selection-mode="english" value="english">翻译·学英语</option>
            <option value="verify">核验真假</option>
          </select>
        </div>
        <label class="zili-vision-route" hidden>
          <select aria-label="修改截图任务">
            <option value="translate">翻译</option>
            <option value="explain">解释</option>
            <option value="answer">解题</option>
            <option value="comment">回复</option>
            <option value="verify">核验真假</option>
            <option value="copy_text">提取文字</option>
          </select>
        </label>
        <img class="zili-vision-preview" alt="本次识别的截图" hidden>
        <div class="zili-meta"><span class="zili-intent"></span><span class="zili-confidence"></span></div>
        <p class="zili-output"></p>
        <button class="zili-output-toggle" type="button" hidden>展开完整提示词</button>
        <div class="zili-verify-details" hidden>
          <div class="zili-verify-block" data-verify-block="corrected"><strong>更准确的说法</strong><p></p></div>
          <div class="zili-verify-block" data-verify-block="evidence"><strong>关键依据</strong><p></p></div>
          <div class="zili-verify-block" data-verify-block="sources"><strong>来源</strong><ul></ul></div>
          <div class="zili-verify-block" data-verify-block="ai"><strong>AI 痕迹说明</strong><p></p></div>
        </div>
        <div class="zili-footer">
          <button class="zili-apply" type="button">写进输入框</button>
          <button class="zili-copy" type="button">复制</button>
        </div>
        <div class="zili-restore-row" hidden>
          <span>润色结果已写入</span>
          <button class="zili-restore-original" type="button">恢复原文</button>
        </div>
        <details class="zili-usage" hidden>
          <summary><span class="zili-usage-leading"><span class="zili-usage-summary">本次用量</span><button class="zili-quick-regenerate" type="button" aria-label="重新生成一版" title="重新生成一版" hidden>↻</button></span><small>详情</small></summary>
          <p class="zili-usage-detail">输入 0 Token · 输出 0 Token</p>
        </details>
        <details class="zili-followup" hidden>
          <summary><span>继续问</span><small>围绕这段内容接着聊</small></summary>
          <div class="zili-followup-body">
            <div class="zili-followup-history" aria-live="polite"></div>
            <textarea class="zili-followup-input" maxlength="800" rows="3" placeholder="对这张结果继续问…"></textarea>
            <div class="zili-followup-attachment" hidden>
              <input class="zili-followup-image-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
              <button class="zili-followup-add-image" type="button">加图</button>
              <img class="zili-followup-image-preview" alt="本次追问附图" hidden>
              <span class="zili-followup-image-state">可上传或直接粘贴截图 · 仅随本次问题发送</span>
              <button class="zili-followup-remove-image" type="button" aria-label="移除附图" title="移除附图" hidden>×</button>
            </div>
            <div class="zili-followup-actions"><span>Enter 发送 · Shift+Enter 换行</span><button class="zili-followup-send" type="button">发送</button></div>
          </div>
        </details>
        <div class="zili-manual">
          <div class="zili-manual-actions">
            <button class="zili-manual-mode" data-manual-mode="rewrite" type="button">润色</button>
            <button class="zili-manual-mode" data-manual-mode="expand" type="button">补充润色</button>
          </div>
          <div class="zili-manual-length" hidden>
            <span>长度</span>
            <button class="is-selected" data-manual-length="short" type="button">短</button>
            <button data-manual-length="medium" type="button">中</button>
            <button data-manual-length="long" type="button">长</button>
          </div>
          <p class="zili-manual-note">当前是手动润色。想让字里自动处理，可以在插件设置里开启“自动润色”</p>
        </div>
        <details class="zili-tune">
          <summary>调整口吻 <span>展开</span></summary>
          <div class="zili-tune-body">
            <p class="zili-tune-note">只影响这一版，不改你的全局设置</p>
            <div class="zili-tune-presets">
              <button type="button" class="zili-tune-preset" data-zili-preset="human">平常说</button>
              <button type="button" class="zili-tune-preset" data-zili-preset="opinion">直接说想法</button>
              <button type="button" class="zili-tune-preset" data-zili-preset="calm">稳一点说</button>
              <button type="button" class="zili-tune-preset" data-zili-preset="playful">轻松一点</button>
            </div>
            <label class="zili-tune-slider">聊天感 <output data-tune-value="human"></output><input data-tune="human" type="range" min="0" max="100"></label>
            <label class="zili-tune-slider">观点强度 <output data-tune-value="opinion"></output><input data-tune="opinion" type="range" min="0" max="100"></label>
            <label class="zili-tune-slider">句式倾向 <output data-tune-value="question"></output><input data-tune="question" type="range" min="0" max="100"></label>
            <label class="zili-tune-slider">内容长度 <output data-tune-value="length"></output><input data-tune="length" type="range" min="0" max="100"></label>
            <button class="zili-regenerate" type="button">重新生成一版</button>
          </div>
        </details>
      </section>`;

    state.shadow.querySelector(".zili-close").addEventListener("click", hideHost);
    state.shadow.querySelector(".zili-apply").addEventListener("click", () => {
      if (state.currentRewrite?.output) {
        writeRewriteToComposer(state.currentRewrite);
      } else if (state.currentMethod?.output) {
        writeMethodToComposer(state.currentMethod);
      } else if (state.currentComment?.output) {
        writeCommentToReply(state.currentComment.output);
      }
    });
    state.shadow.querySelector(".zili-copy").addEventListener("click", copyCandidate);
    state.shadow.querySelector(".zili-restore-original").addEventListener("click", restoreRewriteOriginal);
    state.shadow.querySelector(".zili-followup-send").addEventListener("click", sendFollowup);
    state.shadow.querySelector(".zili-followup-add-image").addEventListener("click", () => {
      state.shadow.querySelector(".zili-followup-image-input").click();
    });
    state.shadow.querySelector(".zili-followup-image-input").addEventListener("change", event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void setFollowupImage(file);
    });
    state.shadow.querySelector(".zili-followup-remove-image").addEventListener("click", clearFollowupImage);
    state.shadow.querySelector(".zili-followup-input").addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || globalThis.ZiliKeyGuard?.isImeKey(event)) return;
      event.preventDefault();
      void sendFollowup();
    });
    state.shadow.querySelector(".zili-followup-input").addEventListener("paste", event => {
      const file = [...(event.clipboardData?.files || [])].find(item => /^image\/(?:png|jpeg|webp)$/i.test(item.type));
      if (!file) return;
      event.preventDefault();
      void setFollowupImage(file);
    });
    state.shadow.querySelector(".zili-followup").addEventListener("toggle", () => {
      const summary = state.shadow.querySelector(".zili-followup summary small");
      if (summary) summary.textContent = state.shadow.querySelector(".zili-followup").open ? "在下方输入你的问题" : "围绕这段内容接着聊";
      requestAnimationFrame(positionHost);
    });
    state.shadow.querySelectorAll("[data-manual-mode]").forEach(button => {
      button.addEventListener("click", () => {
        state.manualMode = button.dataset.manualMode === "expand" ? "expand" : "rewrite";
        renderManualControls();
        if (state.manualMode === "rewrite") requestManualRewrite("rewrite");
        else requestAnimationFrame(positionHost);
      });
    });
    state.shadow.querySelectorAll("[data-manual-length]").forEach(button => {
      button.addEventListener("click", () => {
        state.manualLength = button.dataset.manualLength;
        state.manualMode = "expand";
        renderManualControls();
        requestManualRewrite("expand");
      });
    });
    state.shadow.querySelector(".zili-regenerate").addEventListener("click", regenerateCandidate);
    state.shadow.querySelector(".zili-quick-regenerate").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      regenerateCandidate();
    });
    state.shadow.querySelector(".zili-route-select").addEventListener("change", event => {
      if (event.target.value === "verify") verifySelection();
      else switchSelectionMode(event.target.value);
    });
    state.shadow.querySelector(".zili-vision-route select").addEventListener("change", event => {
      rerunVisionAs(event.target.value);
    });
    state.shadow.querySelector(".zili-tune").addEventListener("toggle", () => {
      const summary = state.shadow.querySelector(".zili-tune summary span");
      summary.textContent = state.shadow.querySelector(".zili-tune").open ? "收起" : "展开";
      requestAnimationFrame(positionHost);
    });
    state.shadow.querySelectorAll("[data-zili-preset]").forEach(button => {
      button.addEventListener("click", () => {
        const previousStyle = candidateSettings().style;
        state.tuneSettings = ToneOptimizer.applyPreset(button.dataset.ziliPreset, candidateSettings());
        state.tuneChanged = state.tuneSettings.style !== state.currentComment?.toneStyle || previousStyle !== state.tuneSettings.style;
        renderTuneControls();
        requestAnimationFrame(positionHost);
      });
    });
    state.shadow.querySelectorAll("[data-tune]").forEach(input => {
      input.addEventListener("input", () => {
        state.tuneSettings = ToneOptimizer.normalizeSettings({
          ...candidateSettings(),
          [input.dataset.tune]: Number(input.value)
        });
        state.tuneChanged = true;
        renderTuneControls();
      });
    });
    enablePanelDragging();
  }

  function clampPanelPosition(left, top) {
    const width = state.host?.getBoundingClientRect().width || 252;
    const measuredHeight = state.shadow?.querySelector(".zili-card")?.scrollHeight || 220;
    const height = Math.min(measuredHeight, Math.max(92, window.innerHeight - 16));
    return {
      left: Math.max(8, Math.min(Number(left) || 8, Math.max(8, window.innerWidth - width - 8))),
      top: Math.max(8, Math.min(Number(top) || 8, Math.max(8, window.innerHeight - height - 8)))
    };
  }

  function enablePanelDragging() {
    const header = state.shadow?.querySelector(".zili-head");
    if (!header) return;
    const finishDrag = event => {
      const drag = state.panelDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (header.hasPointerCapture?.(event.pointerId)) header.releasePointerCapture(event.pointerId);
      state.panelDrag = null;
      header.classList.remove("is-dragging");
      if (drag.attached && drag.moved) persistCompanionPosition();
    };
    header.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest?.("button, a, input, select, summary")) return;
      event.preventDefault();
      const rect = state.host.getBoundingClientRect();
      const companionRect = state.companionHost?.getBoundingClientRect();
      state.panelDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startCompanionLeft: companionRect?.left || 8,
        startCompanionTop: companionRect?.top || 8,
        attached: state.assistantAttached,
        moved: false
      };
      header.setPointerCapture?.(event.pointerId);
      header.classList.add("is-dragging");
    });
    header.addEventListener("pointermove", event => {
      const drag = state.panelDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 3) return;
      drag.moved = true;
      if (drag.attached) {
        setCompanionPixelPosition(
          drag.startCompanionLeft + deltaX,
          drag.startCompanionTop + deltaY
        );
        return;
      }
      state.panelPosition = clampPanelPosition(
        drag.startLeft + deltaX,
        drag.startTop + deltaY
      );
      positionHost();
    });
    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
    header.addEventListener("dblclick", event => {
      if (event.target.closest?.("button, a, input, select, summary")) return;
      if (state.assistantAttached) {
        void resetCompanionPosition();
        return;
      }
      state.panelPosition = null;
      positionHost();
    });
  }

  function positionHost() {
    if (!state.host) return;
    const composer = findVisibleComposer();
    const isWideCard = ["comment", "method"].includes(state.host.dataset.mode);
    const width = isWideCard ? 390 : 252;
    state.host.style.width = `${width}px`;
    const measuredHeight = state.shadow?.querySelector(".zili-card")?.scrollHeight || 220;
    const height = Math.min(Math.max(measuredHeight, isWideCard ? 220 : 92), window.innerHeight - 24);
    if (state.assistantAttached) {
      const sticker = state.companionShadow?.querySelector(".zili-companion-sticker");
      const anchorRect = sticker?.getBoundingClientRect();
      if (anchorRect?.width > 0) {
        const position = ZiliAssistantLayout.positionCard({
          anchorRect,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          cardWidth: width,
          cardHeight: height
        });
        state.host.style.top = `${position.top}px`;
        state.host.style.left = `${position.left}px`;
        state.host.dataset.placement = "assistant";
        state.host.dataset.assistantPlacement = position.placement;
        state.host.dataset.tail = position.tail;
        return;
      }
    }
    state.host.removeAttribute("data-tail");
    state.host.removeAttribute("data-assistant-placement");
    if (state.panelPosition) {
      state.panelPosition = clampPanelPosition(state.panelPosition.left, state.panelPosition.top);
      state.host.style.top = `${state.panelPosition.top}px`;
      state.host.style.left = `${state.panelPosition.left}px`;
      state.host.dataset.placement = "manual";
      return;
    }
    const position = ZiliInteraction.positionPanel({
      composerRect: composer?.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      panelWidth: width,
      panelHeight: height
    });
    state.host.style.top = `${position.top}px`;
    state.host.style.left = `${position.left}px`;
    state.host.dataset.placement = position.placement;
  }

  function hideHost() {
    state.requestId += 1;
    state.learningCard?.stop();
    globalThis.speechSynthesis?.cancel();
    clearTimeout(state.statusTimer);
    state.host?.classList.remove("is-visible");
    syncAssistantAttachment(false);
    positionCompanion();
    state.lastSelection = "";
    state.currentComment = null;
    state.currentRewrite = null;
    state.currentMethod = null;
    state.manualRewrite = null;
    state.tuneSettings = null;
    state.currentVision = null;
    state.followupSession = null;
    state.followupBusy = false;
    state.rewriteUndo = null;
    setMethodContext("");
  }

  function cancelDisabledFeatures(settings = state.settings) {
    const masterEnabled = ZiliFeatureGates.isMasterEnabled(settings);
    const highlightEnabled = ZiliFeatureGates.allowsHighlight(settings);

    if (!masterEnabled) {
      clearTimeout(state.inputTimer);
      state.inputTimer = null;
      state.activeComposer = null;
      state.lastSourceText = "";
    }
    if (!highlightEnabled) {
      clearTimeout(state.selectionTimer);
      state.selectionTimer = null;
      state.selectionInfo = null;
      state.lastSelection = "";
    }
    if (!masterEnabled || !highlightEnabled) {
      state.requestId += 1;
      state.pendingRequest = null;
      removeScreenshotOverlay();
      hideHost();
    }
    syncCompanionVisibility();
  }

  function dismissManualRewriteAction() {
    state.manualRewrite = null;
    if (state.host?.dataset.mode === "manual") {
      state.host.classList.remove("is-visible");
      syncAssistantAttachment(false);
      positionCompanion();
    }
  }

  function renderRewriteUndo() {
    const row = state.shadow?.querySelector(".zili-restore-row");
    if (!row) return;
    row.hidden = !state.rewriteUndo;
  }

  function clearRewriteUndo() {
    state.rewriteUndo = null;
    renderRewriteUndo();
  }

  function showStatus(text, busy = false, duration = 2600) {
    ensureHost();
    state.host.dataset.mode = "status";
    state.shadow.querySelector(".zili-card").dataset.mode = "status";
    const status = state.shadow.querySelector(".zili-status");
    status.textContent = text;
    status.classList.toggle("is-busy", busy);
    setMethodContext("");
    renderRewriteUndo();
    revealHost();
    companionSpeak(text, busy ? 0 : duration);
    clearTimeout(state.statusTimer);
    if (duration > 0) state.statusTimer = setTimeout(hideHost, duration);
  }

  function formatCost(cost) {
    if (!Number.isFinite(cost?.amount)) return "";
    const symbol = cost?.currency === "USD" ? "$" : "¥";
    if (cost.amount > 0 && cost.amount < 0.0001) return `< ${symbol}0.0001`;
    const digits = cost.amount < 0.01 ? 4 : 3;
    return `${symbol}${cost.amount.toFixed(digits)}`;
  }

  function usageSummary(result) {
    const cost = formatCost(result?.cost);
    if (cost) return `本次约 ${cost}`;
    const total = Number(result?.usage?.totalTokens || 0);
    return total ? `本次 ${total.toLocaleString()} Token` : "";
  }

  function renderUsage(result) {
    const usage = result?.usage;
    const details = state.shadow?.querySelector(".zili-usage");
    if (!details) return;
    const summary = usageSummary(result);
    details.hidden = !usage || !summary;
    details.open = false;
    if (details.hidden) return;
    details.querySelector(".zili-usage-summary").textContent = summary;
    details.querySelector(".zili-quick-regenerate").hidden = !(
      result?.mode === "comment" || state.currentRewrite?.sourceText
    );
    details.querySelector(".zili-usage-detail").textContent = [
      result?.visionModel
        ? `识图 ${result.visionProvider ? `${result.visionProvider}/` : ""}${result.visionModel}`
        : "",
      result?.model
        ? `模型 ${result.provider ? `${result.provider}/` : ""}${result.model}`
        : "",
      `输入 ${Number(usage.inputTokens || 0).toLocaleString()} Token`,
      `输出 ${Number(usage.outputTokens || 0).toLocaleString()} Token`,
      result?.cost?.pricingUpdatedAt ? `按 ${result.cost.pricingUpdatedAt} 价格估算` : "API 未提供可估算价格"
    ].filter(Boolean).join(" · ");
  }

  function readFollowupImage(file) {
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file?.type || "")) {
      return Promise.reject(new Error("只支持 PNG、JPG 或 WebP 图片"));
    }
    if (file.size > FOLLOWUP_IMAGE_MAX_BYTES) {
      return Promise.reject(new Error("图片请控制在 6MB 以内"));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("图片读取失败，请重试"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  async function setFollowupImage(file) {
    const session = state.followupSession;
    if (!session || !state.modelCanSeeImages) return;
    try {
      session.pendingImage = {
        dataUrl: await readFollowupImage(file),
        name: String(file.name || "截图").slice(0, 120)
      };
      session.imageError = "";
    } catch (error) {
      session.imageError = error.message || "图片读取失败，请重试";
    }
    renderFollowup(state.currentComment);
    requestAnimationFrame(positionHost);
  }

  function clearFollowupImage() {
    const session = state.followupSession;
    if (!session) return;
    session.pendingImage = null;
    session.imageError = "";
    renderFollowup(state.currentComment);
    requestAnimationFrame(positionHost);
  }

  function renderFollowup(result = state.currentComment) {
    const details = state.shadow?.querySelector(".zili-followup");
    if (!details) return;
    const allowed = Boolean(
      result?.output
      && !result.localTrigger
      && (result.vision || state.selectionInfo?.text)
    );
    details.hidden = !allowed;
    if (!allowed) {
      state.followupSession = null;
      return;
    }
    const initialAnswer = result.initialAnswer || result.output;
    const sourceKey = `${result.vision ? "vision" : "selection"}:${state.selectionInfo?.text || ""}:${initialAnswer}`;
    if (!state.followupSession || state.followupSession.sourceKey !== sourceKey) {
      state.followupSession = {
        sourceKey,
        selectedText: state.selectionInfo?.text || "",
        pageContext: articleContext(state.selectionInfo?.article)
          || `${document.title || "当前网页"} · ${location.hostname || ""}`.trim(),
        screenshotText: "",
        initialAnswer,
        messages: [],
        pendingImage: null,
        imageError: ""
      };
    }
    const history = details.querySelector(".zili-followup-history");
    history.replaceChildren();
    for (const message of state.followupSession.messages) {
      const item = document.createElement("div");
      item.className = `zili-followup-message is-${message.role}`;
      item.textContent = `${message.role === "user" ? "你" : "字里"}：${message.content}`;
      history.appendChild(item);
    }
    const input = details.querySelector(".zili-followup-input");
    const sendButton = details.querySelector(".zili-followup-send");
    const attachment = details.querySelector(".zili-followup-attachment");
    const addImage = details.querySelector(".zili-followup-add-image");
    const preview = details.querySelector(".zili-followup-image-preview");
    const imageState = details.querySelector(".zili-followup-image-state");
    const removeImage = details.querySelector(".zili-followup-remove-image");
    input.disabled = state.followupBusy;
    sendButton.disabled = state.followupBusy;
    attachment.hidden = !state.modelCanSeeImages;
    if (state.modelCanSeeImages) {
      const image = state.followupSession.pendingImage;
      addImage.disabled = state.followupBusy;
      preview.hidden = !image;
      preview.src = image?.dataUrl || "";
      removeImage.hidden = !image;
      removeImage.disabled = state.followupBusy;
      imageState.textContent = state.followupSession.imageError
        || (image ? `已附图：${image.name} · 仅随这次问题发送` : "可上传或直接粘贴截图 · 仅随本次问题发送");
      imageState.classList.toggle("is-error", Boolean(state.followupSession.imageError));
    }
    details.open = state.followupBusy || state.followupSession.messages.length > 0 || Boolean(state.followupSession.pendingImage);
  }

  async function sendFollowup() {
    const session = state.followupSession;
    const input = state.shadow?.querySelector(".zili-followup-input");
    if (!session || !input || state.followupBusy) return;
    const image = state.modelCanSeeImages ? session.pendingImage : null;
    const question = String(input.value || "").trim().slice(0, 800)
      || (image ? "请结合这张图片继续回答。" : "");
    if (!question) return;
    state.followupBusy = true;
    session.messages = [
      ...session.messages,
      { role: "user", content: image ? `${question} [附图]` : question }
    ].slice(-12);
    input.value = "";
    renderFollowup(state.currentComment);
    const response = await send({
      type: "OPTIMIZE",
      mode: "followup",
      webSearch: ZiliSelection.shouldUseWebSearch(question),
      settingsOverride: candidateSettings(),
      imageDataUrl: image?.dataUrl || "",
      followup: {
        question,
        selectedText: session.selectedText,
        pageContext: session.pageContext,
        screenshotText: session.screenshotText,
        initialAnswer: session.initialAnswer,
        messages: session.messages.slice(-12)
      }
    });
    state.followupBusy = false;
    if (!response?.ok || !response.output) {
      state.shadow.querySelector(".zili-status").textContent = engineErrorMessage(response?.error);
      renderFollowup(state.currentComment);
      return;
    }
    session.pendingImage = null;
    session.imageError = "";
    session.messages = [
      ...session.messages,
      { role: "assistant", content: response.output }
    ].slice(-12);
    state.currentComment = {
      ...state.currentComment,
      ...response,
      mode: state.currentComment?.mode || "comment",
      output: response.output,
      followup: true,
      localTrigger: false
    };
    state.shadow.querySelector(".zili-status").textContent = "已经接着这张结果卡回答了";
    state.shadow.querySelector(".zili-output").textContent = response.output;
    state.shadow.querySelector(".zili-intent").textContent = response.intent || "连续追问";
    state.shadow.querySelector(".zili-confidence").textContent = `把握度 ${Math.round((response.confidence || 0) * 100)}%`;
    renderVerificationDetails(response);
    renderUsage(response);
    renderFollowup(state.currentComment);
    revealHost();
    requestAnimationFrame(positionHost);
  }

  function renderVerificationDetails(result = null) {
    const details = state.shadow?.querySelector(".zili-verify-details");
    if (!details) return;
    const isVerify = result?.mode === "verify";
    details.hidden = !isVerify;
    if (!isVerify) return;

    const corrected = details.querySelector('[data-verify-block="corrected"]');
    corrected.hidden = !result.correctedClaim;
    corrected.querySelector("p").textContent = result.correctedClaim || "";

    const evidence = details.querySelector('[data-verify-block="evidence"]');
    evidence.hidden = !result.evidence;
    evidence.querySelector("p").textContent = result.evidence || "";

    const ai = details.querySelector('[data-verify-block="ai"]');
    ai.hidden = !result.aiTraceReason;
    ai.querySelector("p").textContent = result.aiTraceReason || "";

    const sourcesBlock = details.querySelector('[data-verify-block="sources"]');
    const sourceList = sourcesBlock.querySelector("ul");
    sourceList.replaceChildren();
    for (const source of Array.isArray(result.sources) ? result.sources : []) {
      const item = document.createElement("li");
      const label = [source.title, source.date].filter(Boolean).join(" · ") || source.url;
      if (source.url) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        link.textContent = label;
        item.appendChild(link);
      } else {
        item.textContent = label;
      }
      sourceList.appendChild(item);
    }
    sourcesBlock.hidden = sourceList.childElementCount === 0;
  }

  function showComment(result) {
    clearRewriteUndo();
    state.currentRewrite = null;
    state.currentMethod = null;
    state.currentComment = result.followup
      ? result
      : { ...result, initialAnswer: result.initialAnswer || result.output, toneStyle: candidateSettings().style };
    state.tuneChanged = false;
    result = state.currentComment;
    ensureHost();
    state.learningCard ||= globalThis.ZiliLearningCard.attach(state.shadow, { send });
    state.learningCard.render(result, state.selectionInfo?.text || "");
    const modeLabels = {
      comment: "根据你高亮的内容，写好了一条回复",
      translate: "英文已经翻成自然中文",
      explain: "这个词，给你讲成小白也能懂的话",
      english: "译文已整理好，展开“学一点”查看用法与例句",
      answer: result.webSearch ? "已联网检索，给你整理好了答案" : "问题已经给你解答好了",
      verify: "已检索来源，真假和 AI 痕迹分开核验"
    };
    const visionLabels = {
      comment: "截图识别为回复，已经写好了一版",
      translate: "截图识别为翻译，已经翻成中文",
      explain: "截图识别为解释，已经整理成小白能懂的话",
      answer: "截图识别为解题，已经给出答案",
      verify: "截图已完成消息核验和 AI 痕迹分析"
    };
    state.host.dataset.mode = "comment";
    state.shadow.querySelector(".zili-card").dataset.mode = "comment";
    state.shadow.querySelector(".zili-status").textContent = result.copyText
      ? "文字已识别，点复制后可粘贴使用"
      : result.localTrigger
      ? "命中你设置的关键词，回复已经放好了"
      : result.vision
      ? (visionLabels[result.mode] || visionLabels.explain)
      : (modeLabels[result.mode] || modeLabels.comment);
    state.shadow.querySelector(".zili-status").classList.remove("is-busy");
    setMethodContext("");
    state.shadow.querySelector(".zili-output").textContent = result.mode === 'english' ? String(result.output || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '') : result.output;
    renderVerificationDetails(result);
    const visionPreview = state.shadow.querySelector(".zili-vision-preview");
    visionPreview.hidden = !result.vision;
    visionPreview.src = state.currentVision?.imageDataUrl || "";
    state.shadow.querySelector(".zili-intent").textContent = result.mode === "verify"
      ? `消息真假：${result.verdict || "证据不足"}`
      : (result.intent || "回应这段内容");
    state.shadow.querySelector(".zili-confidence").textContent = result.mode === "verify"
      ? `AI痕迹风险 ${Math.round(Number(result.aiTracePercent) || 0)}%`
      : `把握度 ${Math.round((result.confidence || 0) * 100)}%`;
    state.shadow.querySelector(".zili-confidence").hidden = result.mode === "english" || result.copyText;
    state.shadow.querySelector(".zili-apply").hidden = ['verify','english'].includes(result.mode) || result.copyText;
    state.shadow.querySelector(".zili-copy").hidden = false;
    state.shadow.querySelector(".zili-apply").textContent = "写进输入框";
    renderSelectionRoute(result.vision ? "" : result.mode);
    renderVisionRoute(result.vision ? result : null);
    renderUsage(result);
    renderFollowup(result.copyText ? null : result);
    setTuneVisible(result.mode === "comment" && !result.localTrigger);
    renderTuneControls();
    revealHost();
    companionSpeak(result.localTrigger
      ? "按你设的关键词回"
      : result.mode === "verify"
        ? "核验好了，你看一下依据"
        : "写好了，你看一下");
  }

  function showRewriteCandidate(result, composer, sourceText) {
    clearRewriteUndo();
    state.currentComment = null;
    state.currentMethod = null;
    state.manualRewrite = null;
    state.currentRewrite = {
      ...result,
      composer,
      sourceText
    };
    ensureHost();
    state.learningCard ||= globalThis.ZiliLearningCard.attach(state.shadow, { send });
    state.learningCard.render(result, sourceText);
    state.host.dataset.mode = "comment";
    state.shadow.querySelector(".zili-card").dataset.mode = "comment";
    state.shadow.querySelector(".zili-status").textContent = "给你润色了一版，确认后再写入";
    state.shadow.querySelector(".zili-status").classList.remove("is-busy");
    setMethodContext("");
    state.shadow.querySelector(".zili-output").textContent = result.output;
    renderVerificationDetails();
    const visionPreview = state.shadow.querySelector(".zili-vision-preview");
    visionPreview.hidden = true;
    visionPreview.src = "";
    state.shadow.querySelector(".zili-intent").textContent = result.intent || "润色当前草稿";
    state.shadow.querySelector(".zili-confidence").textContent = `把握度 ${Math.round((result.confidence || 0) * 100)}%`;
    state.shadow.querySelector(".zili-apply").hidden = false;
    state.shadow.querySelector(".zili-copy").hidden = false;
    state.shadow.querySelector(".zili-apply").textContent = "写进输入框";
    renderSelectionRoute("");
    renderVisionRoute(null);
    renderUsage(result);
    renderFollowup(null);
    setTuneVisible(true);
    renderTuneControls();
    revealHost();
    companionSpeak("润色好了，你看一下");
  }

  function showManualRewriteAction(preferredComposer = state.activeComposer) {
    if (!ZiliFeatureGates.allowsManualRewrite(state.settings)) return;
    if (ToneOptimizer.autoRewriteEnabled(state.settings)) return;
    const composer = findLiveComposer(preferredComposer);
    const sourceText = getText(composer);
    if (!composer) return;
    clearRewriteUndo();
    state.activeComposer = composer;
    state.currentComment = null;
    state.currentRewrite = null;
    state.currentMethod = null;
    state.manualRewrite = { composer, sourceText };
    state.manualMode = "rewrite";
    ensureHost();
    renderFollowup(null);
    state.host.dataset.mode = "manual";
    state.shadow.querySelector(".zili-card").dataset.mode = "manual";
    state.shadow.querySelector(".zili-status").textContent = "我可以按原文润色，也可以顺着开头和主题补充";
    state.shadow.querySelector(".zili-status").classList.remove("is-busy");
    state.shadow.querySelector(".zili-copy").hidden = false;
    setMethodContext("");
    renderVerificationDetails();
    renderSelectionRoute("");
    renderVisionRoute(null);
    setTuneVisible(false);
    renderManualControls();
    revealHost();
    companionSpeak("写好了就点润色，想续写就点补充");
  }

  function renderManualControls() {
    state.shadow?.querySelectorAll("[data-manual-mode]").forEach(button => {
      button.classList.toggle("is-selected", button.dataset.manualMode === state.manualMode);
    });
    const lengthControls = state.shadow?.querySelector(".zili-manual-length");
    if (lengthControls) lengthControls.hidden = state.manualMode !== "expand";
    state.shadow?.querySelectorAll("[data-manual-length]").forEach(button => {
      button.classList.toggle("is-selected", button.dataset.manualLength === state.manualLength);
    });
  }

  function setMethodContext(text) {
    const context = state.shadow?.querySelector(".zili-method-context");
    if (!context) return;
    context.hidden = !text;
    context.textContent = text || "";
    if (!text) renderMethodPicks(null);
  }

  // 架构师的 2–3 张候选卡：点哪张，下面的 Prompt 就换成哪张的写法。
  function renderMethodPicks(options) {
    const box = state.shadow?.querySelector(".zili-method-picks");
    if (!box) return;
    const picks = options?.picks?.length ? options.picks
      : options?.recommendation ? [{ method: options.recommendation, reason: options.reason || options.recommendation.reason }] : [];
    box.hidden = !picks.length;
    box.replaceChildren(...picks.map(pick => {
      const button = document.createElement("button");
      const name = document.createElement("strong");
      const reason = document.createElement("span");
      button.type = "button";
      name.textContent = pick.method.name;
      reason.textContent = pick.reason || pick.method.summary;
      button.append(name, document.createElement("i"), reason);
      button.setAttribute("aria-pressed", String(pick.method.id === options.recommendation.id));
      button.addEventListener("click", () => {
        showMethodRecommendation(options.composer, { ...options, recommendation: pick.method, reason: pick.reason });
      });
      return button;
    }));
  }

  // 架构师要知道你和 Agent 聊到哪了：取页面主体最近一段文字（去掉正在打的草稿）。
  function chatContextFor(sourceText) {
    const root = document.querySelector("main") || document.body;
    return String(root?.innerText || "")
      .replace(sourceText, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(-3000);
  }

  function methodRecommendationFor(composer) {
    if (!composer || isSensitiveComposer(composer)) return null;
    return ZiliMethodLibrary.recommend(getText(composer), {
      hostname: location.hostname,
      customCards: state.methodCards
    });
  }

  function architectModeFor(composer) {
    return Boolean(
      state.settings.architectMode
      && composer
      && !isSensitiveComposer(composer)
      && ZiliMethodLibrary.platform(location.hostname)
    );
  }

  function showArchitectQuestion(preferredComposer, question, result, sourceText) {
    const composer = findLiveComposer(preferredComposer, sourceText);
    if (!composer || getText(composer) !== sourceText) return false;
    clearRewriteUndo();
    state.activeComposer = composer;
    state.currentComment = null;
    state.currentRewrite = null;
    state.manualRewrite = null;
    state.currentMethod = null;
    state.architectClarification = question;
    ensureHost();
    state.host.dataset.mode = "method";
    state.shadow.querySelector(".zili-card").dataset.mode = "method";
    state.shadow.querySelector(".zili-status").textContent = "架构师还需要确认一件事";
    state.shadow.querySelector(".zili-status").classList.remove("is-busy");
    setMethodContext("已用当前 API 理解你的语境。补充这一点后，我会继续判断最适合的方法。");
    state.shadow.querySelector(".zili-output").textContent = question;
    state.shadow.querySelector(".zili-intent").textContent = "补充一个关键信息";
    state.shadow.querySelector(".zili-confidence").textContent = "架构师模式";
    state.shadow.querySelector(".zili-confidence").hidden = false;
    state.shadow.querySelector(".zili-apply").hidden = true;
    state.shadow.querySelector(".zili-copy").hidden = true;
    state.shadow.querySelector(".zili-vision-preview").hidden = true;
    state.shadow.querySelector(".zili-vision-preview").src = "";
    renderVerificationDetails();
    renderSelectionRoute("");
    renderVisionRoute(null);
    renderUsage(result);
    renderFollowup(null);
    setTuneVisible(false);
    revealHost();
    companionSpeak("我只差确认这一点", 3600);
    return true;
  }

  async function routeArchitectIntent(preferredComposer = state.activeComposer, options = {}) {
    const composer = findLiveComposer(preferredComposer);
    const sourceText = getText(composer);
    if (!architectModeFor(composer) || sourceText.length < 2) return { ok: true, kind: "none" };
    const useCachedNone = state.architectLastResult?.sourceText === sourceText
      && state.architectLastResult?.kind === "none";
    if (useCachedNone) {
      options.onNone?.(composer, sourceText);
      return { ok: true, kind: "none", cached: true };
    }
    if (!options.manual && state.architectRoutedText === sourceText) return { ok: true, kind: "skipped" };
    const routeId = ++state.architectRouteId;
    state.architectRoutedText = sourceText;
    showStatus("架构师正在理解你的意思…", true, 0);
    const response = await send({
      type: "ZILI_ARCHITECT_ROUTE",
      text: sourceText,
      context: chatContextFor(sourceText)
    }, { timeoutMs: 25_000 });
    if (routeId !== state.architectRouteId || getText(composer) !== sourceText || !architectModeFor(composer)) {
      return { ok: false, error: "stale" };
    }
    if (!response?.ok) {
      showStatus(engineErrorMessage(response?.error));
      return response || { ok: false, error: "architect_route_failed" };
    }
    state.architectLastResult = { sourceText, kind: response.kind };
    if (response.kind === "method" && response.method) {
      state.architectClarification = null;
      showMethodRecommendation(composer, {
        recommendation: response.method,
        reason: response.reason,
        picks: response.picks,
        task: response.task,
        result: response,
        sourceText,
        architect: true
      });
    } else if (response.kind === "question" && response.question) {
      showArchitectQuestion(composer, response.question, response, sourceText);
    } else {
      state.architectClarification = null;
      // 判断完不推荐也给一句回应，免得看起来像没反应。
      hideHost();
      companionSpeak("架构师看过了：这句直接发就行", 2600);
      options.onNone?.(composer, sourceText);
    }
    return response;
  }

  function showMethodRecommendation(preferredComposer = state.activeComposer, options = {}) {
    const composer = findLiveComposer(preferredComposer);
    const sourceText = options.sourceText || getText(composer);
    const activePlatform = ZiliMethodLibrary.platform(location.hostname);
    if (!composer || !sourceText) {
      showStatus("先写下你正在想的事，我再帮你找方法");
      return false;
    }
    if (!activePlatform) {
      showStatus("方法推荐只会在已识别的 AI 聊天网页出现");
      return false;
    }
    const recommendation = options.recommendation || methodRecommendationFor(composer);
    if (!recommendation) {
      showStatus(options.manual
        ? "这段话暂时没有命中合适的方法，继续按你的思路聊就好"
        : "这段话还不够像一个方法问题，我先不打扰");
      return false;
    }
    const output = ZiliMethodLibrary.renderPrompt(recommendation, options.task || sourceText);
    clearRewriteUndo();
    state.activeComposer = composer;
    state.currentComment = null;
    state.currentRewrite = null;
    state.manualRewrite = null;
    state.currentMethod = { ...recommendation, output, composer, sourceText, options: { ...options, recommendation } };
    state.methodSuggestedText = sourceText;
    ensureHost();
    state.host.dataset.mode = "method";
    state.shadow.querySelector(".zili-card").dataset.mode = "method";
    const pickCount = options.picks?.length || 1;
    state.shadow.querySelector(".zili-status").textContent = options.architect
      ? (pickCount > 1 ? `架构师给你挑了 ${pickCount} 种问法，选一种发给 ${activePlatform.label}` : `架构师推荐这样问 ${activePlatform.label}`)
      : "可以换个问法：本地判断，不调用模型";
    state.shadow.querySelector(".zili-status").classList.remove("is-busy");
    setMethodContext("");
    renderMethodPicks({ ...options, composer, sourceText, recommendation });
    const outputBox = state.shadow.querySelector(".zili-output");
    const toggle = state.shadow.querySelector(".zili-output-toggle");
    outputBox.textContent = output;
    outputBox.classList.remove("is-expanded");
    toggle.textContent = "展开完整提示词";
    toggle.hidden = false;
    toggle.onclick = () => {
      const expanded = outputBox.classList.toggle("is-expanded");
      toggle.textContent = expanded ? "收起" : "展开完整提示词";
      positionHost();
    };
    state.shadow.querySelector(".zili-intent").textContent = "会写进聊天框的提示词";
    state.shadow.querySelector(".zili-confidence").hidden = true;
    state.shadow.querySelector(".zili-apply").hidden = false;
    state.shadow.querySelector(".zili-copy").hidden = false;
    state.shadow.querySelector(".zili-apply").textContent = "写进聊天框";
    state.shadow.querySelector(".zili-vision-preview").hidden = true;
    state.shadow.querySelector(".zili-vision-preview").src = "";
    renderVerificationDetails();
    renderSelectionRoute("");
    renderVisionRoute(null);
    renderUsage(options.result || null);
    renderFollowup(null);
    setTuneVisible(false);
    revealHost();
    companionSpeak(`我觉得可以先用「${recommendation.name}」`, 3600);
    return true;
  }

  function requestManualRewrite(manualMode = "rewrite") {
    const candidate = state.manualRewrite;
    const composer = findLiveComposer(candidate?.composer, candidate?.sourceText || "");
    if (!candidate || !composer) {
      showStatus("草稿已经变了，停一下再选“润色”或“补充润色”");
      return;
    }
    const sourceText = getText(composer);
    if (!sourceText) {
      showStatus("没有识别到内容，请输入需要润色的文字或主题");
      return;
    }
    if (architectModeFor(composer)) {
      void routeArchitectIntent(composer, {
        manual: true,
        onNone: (liveComposer, routedText) => {
          if (routedText !== candidate.sourceText) {
            showManualRewriteAction(liveComposer);
            return;
          }
          optimizeRewrite(false, liveComposer, {
            mode: manualMode,
            manualTrigger: true,
            lengthTier: state.manualLength,
            directApply: true
          });
        }
      });
      return;
    }
    // With architect mode off, the zero-cost local matcher remains a quiet fallback.
    if (methodRecommendationFor(composer)) {
      showMethodRecommendation(composer, { manual: true });
      return;
    }
    if (sourceText !== candidate.sourceText) {
      showManualRewriteAction(composer);
      return;
    }
    optimizeRewrite(false, composer, {
      mode: manualMode,
      manualTrigger: true,
      lengthTier: state.manualLength,
      directApply: true
    });
  }

  function candidateSettings() {
    if (!state.tuneSettings) {
      state.tuneSettings = ToneOptimizer.normalizeSettings(state.settings);
    }
    return state.tuneSettings;
  }

  function setTuneVisible(visible) {
    const tune = state.shadow?.querySelector(".zili-tune");
    if (!tune) return;
    tune.hidden = !visible;
    if (!visible) tune.open = false;
  }

  function renderSelectionRoute(mode) {
    const route = state.shadow?.querySelector(".zili-route");
    if (!route) return;
    route.hidden = !mode || Boolean(state.currentRewrite);
    if (route.hidden) return;

    const select = route.querySelector(".zili-route-select");
    const selectableModes = ["comment", "explain", "translate", "answer", "english"];
    select.querySelectorAll("option").forEach(option => {
      option.disabled = option.value === "explain"
        ? !["explain", "answer"].some(m => ZiliFeatureGates.allowsSelectionMode(state.settings, m))
        : !ZiliFeatureGates.allowsSelectionMode(state.settings, option.value);
    });
    if (mode === "verify") select.value = "verify";
    else if (selectableModes.includes(mode)) select.value = mode === "answer" ? "explain" : mode === "translate" ? "english" : mode;
  }

  function renderVisionRoute(result) {
    const route = state.shadow?.querySelector(".zili-vision-route");
    if (!route) return;
    route.hidden = !result?.vision;
    if (route.hidden) return;
    route.querySelector("select").value = result.copyText
      ? "copy_text"
      : ["translate", "explain", "answer", "comment", "verify"].includes(result.mode) ? result.mode : "explain";
  }

  function rerunVisionAs(requestedMode) {
    if (!state.currentVision?.imageDataUrl) return;
    state.currentComment = null;
    analyzeScreenshotImage(
      state.currentVision.imageDataUrl,
      state.currentVision.source,
      requestedMode
    );
  }

  function switchSelectionMode(targetMode = "") {
    const info = state.selectionInfo;
    const nextMode = targetMode === "explain" && ZiliSelection.looksLikeQuestion(info?.text || "") ? "answer" : targetMode;
    clearTimeout(state.selectionTimer);
    if (info?.text && nextMode === "english" && ZiliFeatureGates.allowsSelectionMode(state.settings, "english")) {
      state.selectionInfo = { ...info, mode: "english", modeOverride: true, webSearch: false };
      const source = state.selectionInfo;
      const requestId = ++state.requestId;
      state.currentComment = null;
      showStatus("正在翻译并整理语言要点…", true, 0);
      send({ type: "ZILI_ASSIST", action: "english", text: `所选内容：${info.text}\n附近语境（不能代替所选内容）：${articleContext(info.article) || document.title}` }).then(response => {
        if (requestId !== state.requestId || state.selectionInfo !== source || !state.settings.enabled || !state.settings.selectionComments) return;
        if (!response?.ok) return showStatus(response?.error || "学习请求失败，请重试");
        showComment({ ...response, mode: "english", output: response.text, intent: "翻译·学英语" });
      }).catch(() => { if (requestId === state.requestId) showStatus("学习请求失败，请重试"); });
      return;
    }
    if (!info || !["comment", "explain", "translate", "answer"].includes(nextMode) || (info.mode === nextMode && state.currentComment)) return;
    if (!ZiliFeatureGates.allowsSelectionMode(state.settings, nextMode)) return;

    state.selectionInfo = {
      ...info,
      mode: nextMode,
      modeOverride: true,
      webSearch: nextMode === "answer" && ZiliSelection.shouldUseWebSearch(info.text)
    };
    state.currentComment = null;
    optimizeComment(true);
  }

  function verifySelection() {
    const info = state.selectionInfo;
    if (!info?.text || info.mode === "verify") return;
    state.selectionInfo = {
      ...info,
      mode: "verify",
      modeOverride: true,
      webSearch: true
    };
    state.currentComment = null;
    optimizeComment(true);
  }

  function renderTuneControls() {
    if (!state.shadow) return;
    const settings = candidateSettings();
    state.shadow.querySelectorAll("[data-zili-preset]").forEach(button => {
      button.classList.toggle("is-selected", button.dataset.ziliPreset === settings.style);
    });
    state.shadow.querySelectorAll("[data-tune]").forEach(input => {
      const key = input.dataset.tune;
      input.value = settings[key];
      const output = state.shadow.querySelector(`[data-tune-value="${key}"]`);
      if (!output) return;
      output.textContent = key === "question"
        ? `疑问 ${settings[key]}%`
        : key === "length"
          ? `话痨 ${settings[key]}%`
          : `${settings[key]}%`;
    });
    const regenerate = state.shadow.querySelector(".zili-regenerate");
    const styleLabel = ToneOptimizer.PRESETS?.[settings.style]?.label || "这个口吻";
    regenerate.textContent = state.tuneChanged
      ? `用${styleLabel}重新生成`
      : state.currentRewrite ? "重新润色一版" : "重新生成一版";
  }

  function regenerateCandidate() {
    if (state.currentVision?.imageDataUrl) {
      rerunVisionAs(state.currentComment?.mode || state.currentVision.requestedMode || "auto");
    } else if (state.currentRewrite?.sourceText) {
      optimizeRewrite(true, state.currentRewrite.composer, { mode: state.currentRewrite.mode || "rewrite", lengthTier: state.currentRewrite.lengthTier || state.manualLength, manualTrigger: true });
    } else if (state.currentComment?.output) {
      optimizeComment(true);
    }
  }

  function restoreRewriteOriginal() {
    const undo = state.rewriteUndo;
    const composer = findLiveComposer(undo?.composer);
    if (!undo || !composer) {
      clearRewriteUndo();
      showStatus("原来的输入框已经不在了，不能恢复");
      return;
    }
    if (!ZiliInteraction.canRestoreRewrite(getText(composer), undo.appliedText)) {
      clearRewriteUndo();
      showStatus("内容已经被你修改，为了不覆盖你的编辑，不能恢复原文");
      return;
    }
    state.suppressInput = true;
    const writeResult = ZiliWriteback.replace(composer, undo.originalText);
    if (!writeResult.ok) {
      state.suppressInput = false;
      showStatus("恢复失败，你现在的内容没有被改动");
      return;
    }
    const restoredText = undo.originalText.trim();
    state.rewriteGuard.recordApplied(composer, undo.appliedText, restoredText);
    state.activeComposer = composer;
    state.lastAppliedText = restoredText;
    state.lastSourceText = restoredText;
    clearRewriteUndo();
    queueMicrotask(() => {
      state.suppressInput = false;
    });
    queueMicrotask(() => verifySingleWrite(composer, restoredText));
    requestAnimationFrame(() => verifySingleWrite(composer, restoredText));
    setTimeout(() => verifySingleWrite(composer, restoredText), 180);
    if (undo.methodOptions && showMethodRecommendation(composer, { ...undo.methodOptions, composer, sourceText: restoredText })) {
      state.shadow.querySelector(".zili-status").textContent = "已恢复原文，可以换一种问法";
      return;
    }
    showStatus("已恢复润色前的内容");
  }

  function replaceComposer(text, options = {}) {
    const element = findLiveComposer(options.composer || state.activeComposer, options.expectedText || "");
    if (!element || !document.contains(element)) return false;
    state.activeComposer = element;
    state.suppressInput = true;
    const writeResult = ZiliWriteback.replace(element, text);
    if (!writeResult.ok) {
      state.suppressInput = false;
      return false;
    }

    const appliedText = text.trim();
    if (options.automatic) {
      state.rewriteGuard.recordApplied(element, options.expectedText, appliedText);
    }
    state.lastAppliedText = appliedText;
    state.lastSourceText = state.lastAppliedText;
    const originalText = String(options.undoSource || "").trim();
    if (originalText && originalText !== appliedText) {
      state.rewriteUndo = {
        composer: element,
        originalText,
        appliedText
      };
    } else if (options.clearUndo !== false) {
      clearRewriteUndo();
    }
    queueMicrotask(() => {
      state.suppressInput = false;
    });
    queueMicrotask(() => verifySingleWrite(element, appliedText));
    requestAnimationFrame(() => verifySingleWrite(element, appliedText));
    setTimeout(() => verifySingleWrite(element, appliedText), 180);
    if (!options.silent) {
      const costLabel = usageSummary(options.usageResult);
      showStatus([
        options.automatic ? "已直接润色到输入框 · 你仍可继续修改" : "已写入一份，发出前再看一眼",
        costLabel
      ].filter(Boolean).join(" · "), false, state.rewriteUndo ? 0 : 2600);
    }
    return true;
  }

  function verifySingleWrite(preferredComposer, expectedText) {
    const composer = findLiveComposer(preferredComposer);
    if (!composer) return false;
    const result = ZiliWriteback.reconcile(composer, expectedText);
    if (!result.ok || result.method !== "reconciled") return false;
    clearTimeout(state.inputTimer);
    state.activeComposer = composer;
    state.lastAppliedText = expectedText.trim();
    state.lastSourceText = state.lastAppliedText;
    return true;
  }

  async function copyCandidate() {
    const output = state.currentMethod?.output || state.currentRewrite?.output || state.currentComment?.output;
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showStatus(state.currentMethod ? "方法 Prompt 已复制，粘贴后由你自己发送" : state.currentComment?.copyText ? "识别出的文字已复制" : "回复已复制");
      state.lastSelection = "";
    } catch {
      showStatus(state.currentComment?.copyText ? "复制失败，请选中结果卡文字后复制" : "复制失败，请点“写进输入框”");
    }
  }

  // A reply drafted in the companion chat goes into the input box the user last used, or the
  // visible one on the page. It is only written, never sent.
  // 平台或浏览器自带的翻译按钮文字（“翻译自 英语”“评价此翻译”）会让模型以为要评价翻译，送去当语境前去掉。
  const TRANSLATION_UI = /^(翻译自\s*\S+.*|显示原文|显示翻译|评价此翻译.*|Translated from .*|Show original|Show translation|Rate this translation.*)$/i;
  function articleContext(article) {
    const text = String(article?.innerText || "");
    return text.split("\n").filter(line => !TRANSLATION_UI.test(line.trim())).join("\n").slice(0, 1200);
  }

  function writeDraftToPage(text) {
    const composer = findVisibleComposer() || findLiveComposer(state.activeComposer);
    if (!composer) return { ok: false };
    // Focusing the box would pop the rewrite card over the chat; this write came from the chat.
    state.draftWrittenAt = Date.now();
    composer.focus?.({ preventScroll: true });
    const before = getText(composer);
    return { ok: replaceComposer(text, { composer, expectedText: before, undoSource: before, silent: true }) };
  }

  function writeRewriteToComposer(candidate) {
    const composer = findLiveComposer(candidate.composer, candidate.sourceText);
    if (!composer || getText(composer) !== candidate.sourceText) {
      showStatus("草稿已经变化，停一下会重新生成");
      return;
    }
    replaceComposer(candidate.output, {
      composer,
      expectedText: candidate.sourceText,
      undoSource: candidate.sourceText,
      usageResult: candidate
    });
    state.currentRewrite = null;
  }

  function writeMethodToComposer(candidate) {
    const composer = findLiveComposer(candidate.composer, candidate.sourceText);
    if (!composer || getText(composer) !== candidate.sourceText) {
      showStatus("原来的草稿已经变化，为避免覆盖，这次没有写入");
      return;
    }
    replaceComposer(candidate.output, {
      composer,
      expectedText: candidate.sourceText,
      undoSource: candidate.sourceText
    });
    // 记住这组候选卡：恢复原文后还能接着换一张。
    if (state.rewriteUndo) state.rewriteUndo.methodOptions = candidate.options;
    state.currentMethod = null;
  }

  async function writeCommentToReply(text) {
    const replyButton = state.currentComment?.vision
      ? null
      : state.selectionInfo?.article?.querySelector?.('button[data-testid="reply"]');
    if (!replyButton) {
      const current = findLiveComposer(state.activeComposer);
      if (current && current.getBoundingClientRect().width > 0) {
        replaceComposer(text, { composer: current });
        state.lastSelection = "";
      } else {
        await copyCandidate();
      }
      return;
    }

    const existingComposers = new Set(
      Array.from(document.querySelectorAll(COMPOSER_SELECTOR)).map(resolveComposer).filter(Boolean)
    );
    replyButton.click();
    showStatus("已打开回复框，正在写入…", true, 0);
    setTimeout(() => {
      const active = resolveComposer(document.activeElement);
      const composer = active || Array.from(document.querySelectorAll(COMPOSER_SELECTOR))
        .map(resolveComposer)
        .filter(Boolean)
        .find(candidate => !existingComposers.has(candidate) && candidate.getBoundingClientRect().width > 0);
      if (composer) {
        state.activeComposer = composer;
        replaceComposer(text, { composer });
        state.lastSelection = "";
      } else {
        showStatus("回复框已经打开，请点一下输入区后再试");
      }
    }, 700);
  }

  function engineErrorMessage(error) {
    if (/message_port_closed|runtime_unavailable|empty_response/i.test(error || "")) {
      return "扩展后台刚刚重载，请刷新一次当前网页";
    }
    if (/timeout/i.test(error || "")) return "当前模型响应超时，这次没有改动你的草稿";
    if (/vision_model_required/i.test(error || "")) return "当前模型不能看图，请选择带“可识图”标识的模型";
    if (/vision_key_missing/i.test(error || "")) return "请先保存当前可识图模型的 API Key";
    if (/screenshot_image_invalid/i.test(error || "")) return "截图太大或格式不支持，请重新框选较小区域";
    if (/model_request_invalid/i.test(error || "")) return "截图请求被当前模型拒绝，请在设置里重新选择模型";
    if (/model_not_found/i.test(error || "")) return "当前模型版本不可用，请在设置里重新选择";
    if (/web_search_model_required/i.test(error || "")) return "核验和时效搜索需要先配置支持联网的模型";
    if (/qwen_key_missing/i.test(error || "")) return "核验和时效搜索需要先保存通义千问 API Key";
    if (/key_missing/i.test(error || "")) return "还没有配置当前模型的 API Key";
    if (/auth/i.test(error || "")) return "当前模型的 API Key 无效，请重新设置";
    if (/balance/i.test(error || "")) return "当前模型账户余额不足";
    if (/rate_limited/i.test(error || "")) return "当前模型请求太频繁，稍后再试";
    if (/tone_guard_rejected/i.test(error || "")) return "这次口吻没过检查，保留你的原稿";
    if (/fresh_output_repeated/i.test(error || "")) return "模型连续给了同一句，已经不展示重复答案，点一下再来一版";
    if (/invalid_response/i.test(error || "")) return "当前模型这次没有返回可用句子";
    if (/model_unavailable/i.test(error || "")) return "当前模型暂时不可用，这次没有改动你的草稿";
    return "当前模型请求失败，这次没有改动你的草稿";
  }

  // 在回复别人时，回复框里写的不论是要求（“用繁体回复”“用英文写一段”）还是半句话，都按“读原文、照用户写的去回”处理。
  // X：回复弹窗只看弹窗里的推文；页面内的回复框只在推文详情页，取它之前最近的一条推文。
  // 新发帖的弹窗里没有推文，所以不会被当成回复。其他网站用页面主帖（小红书、抖音、YouTube 等详情页）。
  const REPLY_REQUEST = /^(?:请|麻烦)?你?(?:帮我|给我|替我)?(?:写|来|生成|想|回)?一?(?:篇|条|个|句|段)?(?:回复|评论|回帖|留言)(?:一下|下)?(?:吧|呗)?$/;
  const WRITE_REQUEST = /(?:帮我|给我|替我|麻烦你?|请你?)(?:写|编|回|想|来)|写一?(?:篇|段|条|个|句)/;
  function replyTargetFor(composer) {
    if (!composer) return "";
    let target = "";
    if (/(^|\.)(x|twitter)\.com$/.test(location.hostname)) {
      const dialog = composer.closest('[role="dialog"]');
      if (dialog || /\/status\//.test(location.pathname)) {
        const tweets = [...(dialog || document).querySelectorAll('article [data-testid="tweetText"]')]
          .filter(node => node.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING);
        target = tweets[tweets.length - 1]?.innerText || "";
      }
    } else {
      target = globalThis.ZiliCompanionChat?.pageSnapshot?.().post || "";
    }
    return target.replace(/\s+/g, " ").trim().slice(0, 1200);
  }
  // 有回复对象时，两个字的半句话也值得动手；没有回复对象时沿用原来的判断。
  function readyToWrite(composer, text) {
    return isThoughtReady(text) || (String(text || "").trim().length >= 2 && Boolean(replyTargetFor(composer)));
  }

  async function optimizeRewrite(force = false, preferredComposer = state.activeComposer, options = {}) {
    if (!ZiliFeatureGates.allowsManualRewrite(state.settings)) return;
    const composer = findLiveComposer(preferredComposer);
    const text = getText(composer);
    const manualTrigger = options.manualTrigger === true;
    const manualMode = options.mode === "expand" ? "expand" : "rewrite";
    const lengthTier = ["short", "medium", "long"].includes(options.lengthTier)
      ? options.lengthTier
      : "short";
    if (!composer || (!manualTrigger && !readyToWrite(composer, text))) return;
    if (!manualTrigger && !force && text === state.lastSourceText) return;
    if (!manualTrigger && !force && state.rewriteGuard.shouldSkip(composer, text)) return;
    const replySource = replyTargetFor(composer);
    const compact = text.replace(/[\s，。！？!?,.~～]/g, "");
    if (!replySource && REPLY_REQUEST.test(compact)) {
      showStatus("没找到你要回复的那条内容，选中原文再试");
      return;
    }
    const requestMode = replySource ? "comment" : WRITE_REQUEST.test(compact) ? "expand" : manualMode;

    const previousOutput = force ? String(state.currentRewrite?.output || "") : "";
    const keepPreview = Boolean(previousOutput);
    if (!force) {
      const lengthByTier = { short: 10, medium: 50, long: 100 };
      state.tuneSettings = ToneOptimizer.normalizeSettings({
        ...state.settings,
        length: manualTrigger && manualMode === "expand"
          ? lengthByTier[lengthTier]
          : state.settings.length
      });
    }
    state.activeComposer = composer;
    state.manualRewrite = null;
    state.lastSourceText = text;
    state.currentRewrite = null;
    const id = ++state.requestId;
    state.pendingRequest = "rewrite";
    showStatus(replySource ? "正在帮你写回复…" : requestMode === "expand" ? "正在顺着你的开头或主题补充…" : "正在按你的写作风格润色…", true, 0);
    const response = await send({
      type: "OPTIMIZE",
      mode: requestMode,
      text,
      selectedText: replySource,
      replyBrief: replySource ? text : "",
      context: composerContext(composer),
      manualTrigger,
      lengthTier,
      settingsOverride: candidateSettings(),
      forceFresh: force,
      variationNonce: force ? `${Date.now()}-${Math.random()}` : "",
      previousOutput
    });
    const liveComposer = findLiveComposer(composer, text);
    if (
      id !== state.requestId
      || !ZiliFeatureGates.isMasterEnabled(state.settings)
      || !liveComposer
      || getText(liveComposer) !== text
    ) return;
    state.pendingRequest = null;
    if (!response?.ok) {
      showStatus(engineErrorMessage(response?.error));
      return;
    }
    if (response.ready === false || Number(response.confidence) < 0.62) {
      showStatus(replySource
        ? "这条内容我还没看明白，先不写；可以在后面补一句你想说的方向"
        : requestMode === "expand"
        ? "还没看出你想往哪个方向写，再补几个关键词吧"
        : "这句话的意思还没收住，我先不动");
      return;
    }
    if (!response.output || response.output.trim() === text.trim()) {
      showStatus("这句已经很自然，不用硬改");
      return;
    }
    state.activeComposer = liveComposer;
    if (options.directApply === true) {
      replaceComposer(response.output, {
        composer: liveComposer,
        expectedText: text,
        undoSource: text,
        usageResult: response
      });
    } else if (!keepPreview && ToneOptimizer.rewriteDeliveryMode(candidateSettings()) === "auto") {
      replaceComposer(response.output, {
        automatic: true,
        composer: liveComposer,
        expectedText: text,
        undoSource: text,
        usageResult: response
      });
    } else {
      showRewriteCandidate({ ...response, mode: manualMode, lengthTier }, liveComposer, text);
    }
  }

  async function optimizeComment(force = false) {
    const info = state.selectionInfo;
    if (!info?.text) return;
    if (info.mode === "translate" || info.mode === "english") { switchSelectionMode("english"); return; }
    if (!ToneOptimizer.highlightEnabled(state.settings)) return;
    if (!ZiliFeatureGates.allowsSelectionMode(state.settings, info.mode)) return;
    if (!info.modeOverride && ZiliSelection.classify(info.text, state.settings) !== info.mode) return;
    if (!force && info.text === state.lastSelection) return;
    if (!force) state.tuneSettings = ToneOptimizer.normalizeSettings(state.settings);
    state.lastSelection = info.text;
    const previousOutput = force ? String(state.currentComment?.output || "") : "";
    const previousStyle = force ? String(state.currentComment?.toneStyle || "") : "";
    const nextStyle = candidateSettings().style;
    const id = ++state.requestId;
    state.pendingRequest = "selection";
    const pendingLabels = {
      comment: "正在读这段内容，准备一条合适的回复…",
      translate: "正在把这段英文翻成自然中文…",
      explain: "正在把这个词讲成小白也能听懂的话…",
      answer: info.webSearch ? "正在联网检索并整理答案…" : "正在解答这个问题…",
      verify: "正在检索来源，分别核验消息真假和 AI 痕迹…"
    };
    showStatus(pendingLabels[info.mode] || pendingLabels.comment, true, 0);
    positionHost();
    const response = await send({
      type: "OPTIMIZE",
          mode: info.mode,
          sentenceForm: info.mode === "comment"
            ? ToneOptimizer.chooseSentenceForm(candidateSettings(), Math.random())
        : "statement",
          selectedText: info.text,
          replyContext: info.replyContext,
          webSearch: info.webSearch,
          settingsOverride: candidateSettings(),
          forceFresh: force,
          variationNonce: force ? `${Date.now()}-${Math.random()}` : "",
          previousOutput,
          styleChanged: force && Boolean(previousStyle) && previousStyle !== nextStyle,
          previousStyle,
      pageContext: articleContext(info.article)
        || `${document.title || "当前网页"} · ${location.hostname || ""}`.trim()
    });
    if (
      id !== state.requestId
      || !ZiliFeatureGates.allowsSelectionMode(state.settings, info.mode)
      || state.selectionInfo !== info
      || info.text !== state.lastSelection
    ) return;
    state.pendingRequest = null;
    if (!response?.ok || !response.output) {
      showStatus(engineErrorMessage(response?.error));
      return;
    }
    showComment({ ...response, mode: info.mode });
  }

  function syncFollowupVisionCapability(engineStatus) {
    state.modelCanSeeImages = Boolean(engineStatus?.modelInfo?.capabilities?.includes("vision"));
    if (!state.modelCanSeeImages && state.followupSession) {
      state.followupSession.pendingImage = null;
      state.followupSession.imageError = "";
    }
    if (state.shadow) renderFollowup(state.currentComment);
  }

  async function activate(target) {
    const composer = resolveComposer(target);
    if (!composer) return;
    state.activeComposer = composer;
    const [response, engineStatus] = await Promise.all([
      send({ type: "GET_SETTINGS" }),
      send({ type: "GET_ENGINE_STATUS" })
    ]);
    if (response?.ok) {
      state.settings = ToneOptimizer.normalizeSettings(response.settings);
      state.settingsLoaded = true;
      syncHostTheme();
      syncCompanionVisibility();
    }
    syncFollowupVisionCapability(engineStatus);
    if (Date.now() - (state.draftWrittenAt || 0) < 2000) return;
    // 架构师模式只在打字停下后判断；光标回到输入框（点卡片时网页常会自动聚焦回去）不能弹润色卡把候选卡顶掉。
    if (architectModeFor(composer)) return;
    if (ZiliFeatureGates.isMasterEnabled(state.settings)) {
      clearTimeout(state.inputTimer);
      if (ToneOptimizer.autoRewriteEnabled(state.settings) && ZiliFeatureGates.allowsRewrite(state.settings)) {
        if (!readyToWrite(composer, getText(composer))) return;
        state.inputTimer = setTimeout(() => {
          optimizeRewrite(false, composer);
        }, INPUT_IDLE_MS);
      } else {
        state.inputTimer = setTimeout(() => {
          showManualRewriteAction(composer);
        }, MANUAL_ACTION_DELAY_MS);
      }
    }
  }

  function inspectSelection() {
    if (globalThis.ZiliPageCopy?.isActive()) return;
    if (!ToneOptimizer.highlightEnabled(state.settings)) return;
    if (!ZiliFeatureGates.allowsHighlight(state.settings)) return;
    const selection = document.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (text.length < MIN_SELECTION_LENGTH || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (ZiliSelection.isOwnedSelection(selection, {
      roots: [state.shadow, state.companionShadow],
      hosts: [state.host, state.companionHost],
      pointerOwned: state.internalSelectionOrigin
    })) return; // ignore selections made inside 字里 UI
    if (!anchor || state.host?.contains(anchor) || resolveComposer(anchor)) return;
    const article = anchor.closest?.("article")
      || anchor.closest?.('[data-testid="tweet"]')
      || anchor.closest?.("main")
      || anchor.closest?.("section");
    const triggerRule = ZiliTriggerRules.match(text, state.triggerReplies);
    if (triggerRule) {
      clearTimeout(state.selectionTimer);
      state.selectionInfo = {
        text: text.slice(0, 1200),
        mode: "comment",
        modeOverride: true,
        replyContext: ZiliSelection.classifyReplyContext(text),
        webSearch: false,
        rect: range.getBoundingClientRect(),
        article,
        triggerRuleId: triggerRule.id
      };
      if (state.lastSelection === text && state.currentComment?.triggerRuleId === triggerRule.id) return;
      state.lastSelection = text;
      state.tuneSettings = ToneOptimizer.normalizeSettings(state.settings);
      showComment({
        ok: true,
        output: triggerRule.reply,
        mode: "comment",
        intent: "关键词触发",
        confidence: 1,
        usage: null,
        localTrigger: true,
        triggerRuleId: triggerRule.id
      });
      return;
    }
    const mode = ZiliSelection.classify(text, state.settings);
    if (mode === "ignore") {
      state.selectionInfo = null;
      hideHost();
      return;
    }
    if (!ZiliFeatureGates.allowsSelectionMode(state.settings, mode)) {
      state.selectionInfo = null;
      hideHost();
      return;
    }
    state.selectionInfo = {
      text: text.slice(0, 1200),
      mode,
      modeOverride: false,
      replyContext: ZiliSelection.classifyReplyContext(text),
      webSearch: mode === "answer" && ZiliSelection.shouldUseWebSearch(text),
      rect: range.getBoundingClientRect(),
      article
    };
    clearTimeout(state.selectionTimer);
    state.selectionTimer = setTimeout(() => optimizeComment(false), 650);
  }

  async function loadInitialSettings() {
    const [response, triggerResponse, methodResponse, engineStatus] = await Promise.all([
      send({ type: "GET_SETTINGS" }),
      send({ type: "GET_TRIGGER_REPLIES" }),
      send({ type: "GET_METHOD_CARDS" }),
      send({ type: "GET_ENGINE_STATUS" }),
      loadCompanionPosition()
    ]);
    if (!response?.ok) return;
    state.settings = ToneOptimizer.normalizeSettings(response.settings);
    syncFollowupVisionCapability(engineStatus);
    if (triggerResponse?.ok) {
      state.triggerReplies = ZiliTriggerRules.normalizeConfig(triggerResponse.triggerReplies);
    }
    if (methodResponse?.ok) {
      state.methodCards = ZiliMethodLibrary.normalizeCustomCards(methodResponse.methodCards);
    }
    state.settingsLoaded = true;
    syncHostTheme();
    cancelDisabledFeatures(state.settings);
    companionSpeak("我在这儿，划一下就能问我", 4800);
  }

  document.addEventListener("focusin", event => activate(event.target), true);
  document.addEventListener("click", event => {
    const composer = resolveComposer(event.target);
    if (composer) activate(composer);
  }, true);
  document.addEventListener("input", event => {
    const composer = resolveComposer(event.target);
    if (!composer || !ZiliFeatureGates.isMasterEnabled(state.settings)) return;
    state.activeComposer = composer;
    const text = getText(composer);
    if (state.suppressInput) return;
    if (
      state.rewriteUndo?.composer === composer
      && !ZiliInteraction.canRestoreRewrite(text, state.rewriteUndo.appliedText)
    ) {
      clearRewriteUndo();
    }
    dismissManualRewriteAction();
    const useArchitectMode = architectModeFor(composer);
    // 架构师模式自己按文字去重，不走下面「防重复润色」的跳过规则：
    // 否则最后一下按了删除键之类的情况会让它整句不判断，用户只看到没反应。
    if (useArchitectMode) {
      clearTimeout(state.inputTimer);
      if (text.length < 2) return;
      state.inputTimer = setTimeout(() => {
        void routeArchitectIntent(composer, {
          onNone: liveComposer => {
            if (!ToneOptimizer.autoRewriteEnabled(state.settings)) showManualRewriteAction(liveComposer);
            else if (ZiliFeatureGates.allowsRewrite(state.settings) && getText(liveComposer) !== state.lastAppliedText) optimizeRewrite(false, liveComposer);
          }
        });
      }, INPUT_IDLE_MS);
      return;
    }
    if (!ToneOptimizer.autoRewriteEnabled(state.settings)) {
      clearTimeout(state.inputTimer);
      state.inputTimer = setTimeout(() => {
        const recommendation = methodRecommendationFor(composer);
        if (recommendation && state.methodSuggestedText !== getText(composer)) {
          showMethodRecommendation(composer);
          return;
        }
        showManualRewriteAction(composer);
      }, MANUAL_ACTION_DELAY_MS);
      return;
    }
    const rewriteDecision = state.rewriteGuard.noteInput(composer, text, event.inputType);
    if (rewriteDecision.skip) {
      clearTimeout(state.inputTimer);
      state.lastSourceText = text;
      return;
    }
    if (text === state.lastAppliedText) return;
    if (ZiliWriteback.isExactRepeat(text, state.lastAppliedText)) {
      clearTimeout(state.inputTimer);
      queueMicrotask(() => verifySingleWrite(composer, state.lastAppliedText));
      return;
    }
    clearTimeout(state.inputTimer);
    // Architect mode deliberately accepts a short natural phrase (such as “复盘”)
    // because the model, not a fixed trigger sentence, decides whether it matters.
    if (!readyToWrite(composer, text) && !methodRecommendationFor(composer)) return;
    state.inputTimer = setTimeout(() => {
      if (ToneOptimizer.autoRewriteEnabled(state.settings) && ZiliFeatureGates.allowsRewrite(state.settings)) {
        const recommendation = methodRecommendationFor(composer);
        if (recommendation && state.methodSuggestedText !== getText(composer)) {
          showMethodRecommendation(composer);
          return;
        }
        optimizeRewrite(false, composer);
      } else {
        showManualRewriteAction(composer);
      }
    }, INPUT_IDLE_MS);
  }, true);
  document.addEventListener("selectionchange", inspectSelection, true);
  document.addEventListener("paste", event => void recognizePastedImage(event), true);
  window.addEventListener("zili-copy-mode-start", () => {
    clearTimeout(state.selectionTimer);
    state.selectionInfo = null;
    hideHost();
  });
  document.addEventListener("pointerdown", event => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    state.internalSelectionOrigin = path.includes(state.host) || path.includes(state.companionHost);
    if (!state.companionHost || path.includes(state.companionHost)) return;
    closeCompanionMenu();
  }, true);
  window.addEventListener("scroll", () => positionHost(), true);
  window.addEventListener("resize", () => {
    positionHost();
    positionCompanion();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.settings?.newValue) {
      state.settings = ToneOptimizer.normalizeSettings({
        ...changes.settings.newValue,
        reference: state.settings.reference
      });
      state.settingsLoaded = true;
      state.architectRouteId += 1;
      state.architectRoutedText = "";
      state.architectLastResult = null;
      state.architectClarification = null;
      syncHostTheme();
      cancelDisabledFeatures(state.settings);
      syncCompanionVisibility();
      if (!ToneOptimizer.highlightEnabled(state.settings)) {
        clearTimeout(state.selectionTimer);
        state.selectionInfo = null;
        state.lastSelection = "";
        if (state.currentComment) hideHost();
            if (state.pendingRequest === "selection") {
              state.pendingRequest = null;
              clearTimeout(state.statusTimer);
              hideHost();
            }
      }
    }
    if (areaName === "local" && changes[ZiliTriggerRules.STORAGE_KEY]?.newValue) {
      state.triggerReplies = ZiliTriggerRules.normalizeConfig(
        changes[ZiliTriggerRules.STORAGE_KEY].newValue
      );
    }
    if (areaName === "local" && changes[ZiliMethodLibrary.CUSTOM_METHODS_KEY]?.newValue) {
      state.methodCards = ZiliMethodLibrary.normalizeCustomCards(
        changes[ZiliMethodLibrary.CUSTOM_METHODS_KEY].newValue
      );
    }
    if (areaName === "local" && changes.modelEngine?.newValue) {
      void send({ type: "GET_ENGINE_STATUS" }).then(syncFollowupVisionCapability);
    }
  });
  if (chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "SETTINGS_UPDATED") {
        state.settings = ToneOptimizer.normalizeSettings({
          ...message.settings,
          reference: message.settings?.reference ?? state.settings.reference
        });
        state.settingsLoaded = true;
        state.architectRouteId += 1;
        state.architectRoutedText = "";
        state.architectLastResult = null;
        state.architectClarification = null;
        syncHostTheme();
        cancelDisabledFeatures(state.settings);
        syncCompanionVisibility();
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "METHOD_CARDS_UPDATED") {
        state.methodCards = ZiliMethodLibrary.normalizeCustomCards(message.methodCards);
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "START_SCREENSHOT_SELECTION") {
        if (!ZiliFeatureGates.isMasterEnabled(state.settings)) {
          sendResponse({ ok: false, error: "disabled" });
          return false;
        }
        sendResponse(startScreenshotSelection("auto"));
        return false;
      }
      if (message?.type === "START_COPY_TEXT_SELECTION") {
        if (!ZiliFeatureGates.isMasterEnabled(state.settings)) {
          sendResponse({ ok: false, error: "disabled" });
          return false;
        }
        sendResponse(startScreenshotSelection("copy_text"));
        return false;
      }
      if (message?.type === "SHOW_SCREENSHOT_STATUS") {
        if (!ZiliFeatureGates.isMasterEnabled(state.settings)) {
          sendResponse({ ok: false, error: "disabled" });
          return false;
        }
        showStatus(message.text || "正在识别截图…", true, 0);
        sendResponse({ ok: true });
        return false;
      }
      if (message?.type === "SHOW_SCREENSHOT_RESULT") {
        if (!ZiliFeatureGates.isMasterEnabled(state.settings)) {
          sendResponse({ ok: false, error: "disabled" });
          return false;
        }
        if (!message.result?.ok || !message.imageDataUrl) {
          showStatus(engineErrorMessage(message.result?.error));
        } else {
          state.selectionInfo = null;
          state.currentVision = {
            imageDataUrl: message.imageDataUrl,
            source: message.source || "clipboard",
            requestedMode: message.result.mode || "auto",
            result: message.result
          };
          showComment({ ...message.result, mode: message.result.mode || "explain", vision: true });
        }
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  }
  loadInitialSettings();
})();
