(function initToneOptimizer(global) {
  const PRESETS = {
    human: { label: "平常说", description: "像平时聊天，不刻意加工" },
    opinion: { label: "直接说想法", description: "明确表达自己怎么看" },
    calm: { label: "稳一点说", description: "不把话说满，先看条件和风险" },
    playful: { label: "轻松一点", description: "可以幽默，但不过头" }
  };

  const PRESET_SETTINGS = {
    human: { human: 75, opinion: 45, question: 20, length: 10 },
    opinion: { human: 60, opinion: 80, question: 15, length: 24 },
    calm: { human: 40, opinion: 55, question: 15, length: 10 },
    playful: { human: 85, opinion: 45, question: 30, length: 12 }
  };

  const THEMES = new Set(["mist", "sage", "sand", "ink"]);

  const DEFAULTS = {
    enabled: true,
    autoRewrite: false,
    architectMode: false,
    autoApplyRewrite: true,
    selectionComments: true,
    termExplanation: true,
    questionAnswer: true,
    selectionReply: true,
    floatingCompanion: true,
    theme: "mist",
    style: "human",
    human: 78,
    opinion: 55,
    question: 24,
    length: 10,
    concise: 90,
    reference: "",
    punctuation: "adaptive",
    emoji: "adaptive",
    emojiFavorites: ""
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeSettings(settings = {}) {
    const merged = { ...DEFAULTS, ...settings };
    merged.enabled = Boolean(merged.enabled);
    if (
      !Object.prototype.hasOwnProperty.call(settings, "autoApplyRewrite")
      && Object.prototype.hasOwnProperty.call(settings, "autoOptimize")
    ) {
      merged.autoApplyRewrite = Boolean(settings.autoOptimize);
    } else {
      merged.autoApplyRewrite = Boolean(merged.autoApplyRewrite);
    }
    merged.autoRewrite = Boolean(merged.autoRewrite);
    merged.architectMode = Boolean(merged.architectMode);
    merged.selectionComments = Boolean(merged.selectionComments);
    merged.termExplanation = Boolean(merged.termExplanation);
    merged.questionAnswer = Boolean(merged.questionAnswer);
    merged.selectionReply = Boolean(merged.selectionReply);
    merged.floatingCompanion = Boolean(merged.floatingCompanion);
    if (!THEMES.has(merged.theme)) merged.theme = DEFAULTS.theme;
    const hasLength = Object.prototype.hasOwnProperty.call(settings, "length");
    const hasConcise = Object.prototype.hasOwnProperty.call(settings, "concise");
    if (!hasLength && hasConcise) {
      const oldConcise = Number(settings.concise);
      merged.length = Number.isFinite(oldConcise) ? 100 - oldConcise : DEFAULTS.length;
    }
    if (!PRESETS[merged.style]) merged.style = DEFAULTS.style;
    if (settings.settingsVersion !== 2 && !Object.prototype.hasOwnProperty.call(settings, "punctuation") && Object.prototype.hasOwnProperty.call(settings, "length")) {
      const oldPresetLengths = { human: 35, opinion: 50, calm: 45, playful: 40 };
      const newPresetLength = PRESET_SETTINGS[merged.style]?.length;
      if (Number(settings.length) === oldPresetLengths[merged.style] && Number.isFinite(newPresetLength)) {
        merged.length = newPresetLength;
      }
    }
    for (const key of ["human", "opinion", "question", "length"]) {
      const value = Number(merged[key]);
      merged[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : DEFAULTS[key];
    }
    merged.concise = 100 - merged.length;
    merged.settingsVersion = 2;
    if (!["normal", "sparse", "adaptive", "noPeriods"].includes(merged.punctuation)) merged.punctuation = "adaptive";
    if (!["none", "occasional", "often", "adaptive"].includes(merged.emoji)) merged.emoji = "adaptive";
    merged.emojiFavorites = String(merged.emojiFavorites || "").slice(0, 120);
    delete merged.autoApply;
    delete merged.autoOptimize;
    merged.reference = String(merged.reference || "").slice(0, 2400);
    return merged;
  }

  function applyPreset(style, current = {}) {
    const selected = PRESETS[style] ? style : DEFAULTS.style;
    const next = {
      ...current,
      style: selected,
      ...PRESET_SETTINGS[selected]
    };
    next.concise = 100 - next.length;
    return next;
  }

  function chooseSentenceForm(settings = {}, randomValue = Math.random()) {
    const normalized = normalizeSettings(settings);
    const sample = Number(randomValue);
    const boundedSample = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 1;
    return boundedSample < normalized.question / 100 ? "question" : "statement";
  }

  function rewriteDeliveryMode(settings = {}) {
    return normalizeSettings(settings).autoApplyRewrite ? "auto" : "preview";
  }

  function autoRewriteEnabled(settings = {}) {
    const normalized = normalizeSettings(settings);
    return normalized.enabled && normalized.autoRewrite;
  }

  function highlightEnabled(settings = {}) {
    const normalized = normalizeSettings(settings);
    return normalized.enabled && normalized.selectionComments;
  }

  function inferIntent(text, context = "网页输入") {
    const source = clean(text);
    if (context === "选区回复") return "针对这段内容回复";
    if (/[?？]/.test(source) || /请问|能不能|可以吗|怎么用|为什么/.test(source)) return "提问或确认";
    if (/我觉得|我认为|看来|其实|说到底|问题是|关键是/.test(source)) return "表达观点";
    if (/希望|想要|需要|求|建议|有没有/.test(source)) return "寻求建议";
    return "补充说明";
  }

  function confidenceFor(text, context) {
    const source = clean(text);
    const length = source.length;
    if (context === "选区回复") return length >= 10 ? 0.86 : 0.58;
    if (/能不能|可以吗|怎么|为什么|有没有|是否|能用|行吗|好吗|对吗|请问/.test(source) && length >= 4) return 0.8;
    if (/我觉得|我想|其实|关键|问题|同意|不太|有点/.test(source) && length >= 6) return 0.78;
    if (length >= 24) return 0.92;
    if (length >= 16) return 0.82;
    if (length >= 12) return 0.7;
    return 0.42;
  }

  function removeAiPhrases(text) {
    return text
      .replace(/在当今这个时代[，,]?/g, "")
      .replace(/不得不说[，,]?/g, "")
      .replace(/总的来说[，,]?/g, "")
      .replace(/从某种意义上来说[，,]?/g, "")
      .replace(/非常地/g, "很")
      .replace(/[。！!]+$/g, "")
      .trim();
  }

  function addPunctuation(text) {
    return /[。！？?!…]$/.test(text) ? text : `${text}。`;
  }

  function localRewrite(input = {}) {
    const settings = normalizeSettings(input.settings);
    const source = clean(input.text);
    if (!source) return { output: "", intent: "", confidence: 0, source: "local", reason: "empty" };

    const intent = inferIntent(source, input.context);
    const base = removeAiPhrases(source);
    let output = base;
    if (settings.style === "calm" && intent === "表达观点") output = `我的理解是，${base}`;
    if (settings.style === "opinion" && intent === "补充说明" && settings.opinion >= 60) output = `我更倾向于这样看：${base}`;
    if (settings.style === "playful" && intent === "提问或确认") output = `${base}，我也想知道答案。`;
    output = addPunctuation(output);

    return {
      output,
      intent,
      confidence: confidenceFor(source, input.context),
      source: "local",
      reason: "fallback"
    };
  }

  function localComment(input = {}) {
    const settings = normalizeSettings(input.settings);
    const selectedText = clean(input.selectedText || input.text);
    if (!selectedText) return { output: "", intent: "针对这段内容回复", confidence: 0, source: "local", reason: "empty" };

    let output;
    if (/[?？]/.test(selectedText)) {
      output = "这个问题我也想知道。关键还是看实际调用效果和限制，等有人跑过再下结论。";
    } else if (settings.style === "opinion" || settings.opinion >= 65) {
      output = "这个点挺值得继续看。比起概念本身，我更想知道它在真实使用里到底省了多少事。";
    } else if (settings.style === "playful") {
      output = "这个方向有点意思，先别急着下结论，等真实用起来再看。";
    } else {
      output = "这个点挺值得继续看。真正有价值的，还是它在实际使用里能不能省掉麻烦。";
    }

    return {
      output,
      intent: "针对这段内容回复",
      confidence: confidenceFor(selectedText, "选区回复"),
      source: "local",
      reason: "fallback"
    };
  }

  global.ToneOptimizer = {
    DEFAULTS,
    PRESETS,
    applyPreset,
    normalizeSettings,
    applyPunctuation(output, settings, mode) {
      if (!["comment","rewrite","expand"].includes(mode)) return output;
      // The base voice never ends a short post on a full stop unless the user chose normal punctuation.
      if (!["noPeriods", "normal"].includes(settings?.punctuation)) return String(output || "").replace(/[。.]+(\s*)$/, "$1").trim();
      if (settings?.punctuation !== "noPeriods") return output;
      return String(output || "").split(/(```[\s\S]*?```|`[^`]*`|https?:\/\/[^\s]+)/g).map((part,i)=>i%2 ? part : part.replace(/。/g, " ").replace(/(?<![.\d])\.(?![.\d])(?=\s|$)/g, " ")).join('').trim();
    },
    chooseSentenceForm,
    rewriteDeliveryMode,
    autoRewriteEnabled,
    highlightEnabled,
    inferIntent,
    localRewrite,
    localComment
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
