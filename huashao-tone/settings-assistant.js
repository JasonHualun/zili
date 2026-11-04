(function initZiliSettingsAssistant(global) {
  "use strict";

  const STORAGE_KEYS = {
    wizard: "ziliProfileWizardDraftV2",
    chat: "ziliAssistantChatV1",
    nudge: "ziliProfileNudgeShownV1"
  };
  const MAX_ANSWER_LENGTH = 360;
  const MAX_PROFILE_SCENE_LENGTH = 360;
  const MAX_PROFILE_EXTRA_LENGTH = 240;
  const MAX_REFERENCE_LENGTH = 2400;
  const MAX_CHAT_MESSAGES = 24;
  const MAX_CHAT_CONTENT_LENGTH = 2000;
  const MAX_SAMPLES = 30;
  const KNOWN_EMOJIS = ["🙂", "😂", "😅", "🤔", "👍", "🙌", "❤️", "😭"];
  const PUNCTUATION_VALUES = new Set(["normal", "sparse", "adaptive", "noPeriods"]);
  const EMOJI_VALUES = new Set(["none", "occasional", "often", "adaptive"]);
  const STYLE_VALUES = new Set(["human", "opinion", "calm", "playful"]);
  const PROPOSAL_KEYS = [
    "reference",
    "human",
    "opinion",
    "question",
    "length",
    "style",
    "punctuation",
    "emoji",
    "emojiFavorites"
  ];
  const PROPOSAL_LABELS = {
    reference: "口吻档案",
    human: "聊天感",
    opinion: "观点强度",
    question: "疑问句倾向",
    length: "内容长度",
    style: "口吻预设",
    punctuation: "标点",
    emoji: "表情",
    emojiFavorites: "常用 emoji"
  };
  const PUNCTUATION_LABELS = {
    noPeriods: "不加句号",
    normal: "正常",
    sparse: "少一点",
    adaptive: "看场景"
  };
  const EMOJI_LABELS = {
    none: "不主动加",
    occasional: "偶尔",
    often: "常用",
    adaptive: "看场景"
  };
  const STYLE_LABELS = {
    human: "平常说",
    opinion: "直接说想法",
    calm: "稳一点说",
    playful: "轻松一点"
  };
  const SCENES = [
    {
      id: "agree",
      label: "认同",
      question: "别人说到你也认可的点时，你通常会怎么回？",
      example: "确实，这个点我也这么想"
    },
    {
      id: "surprise",
      label: "惊喜",
      question: "看到一个有意思或意外的东西，你会怎么说？",
      example: "有点东西，我得试一下"
    },
    {
      id: "disagree",
      label: "不同意",
      question: "你不太同意时，通常会怎样表达？",
      example: "我不太认同，还是得看实际情况"
    },
    {
      id: "learn",
      label: "求知",
      question: "你真想学会或弄明白时，会怎么问？",
      example: "这个具体怎么做，和普通方法差在哪"
    },
    {
      id: "comfort",
      label: "安慰",
      question: "对方翻车或有点沮丧时，你会怎么安慰？",
      example: "先别急，至少现在知道问题在哪了"
    },
    {
      id: "opinion",
      label: "观点",
      question: "你想表达自己的判断时，常怎么开头或收尾？",
      example: "我更倾向于这样看，关键还是实际效果"
    }
  ];

  const state = {
    mode: "wizard",
    profileStarted: false,
    hasSavedProfile: false,
    sceneIndex: 0,
    answers: {},
    extraPhrase: "",
    extraAvoid: "",
    punctuation: "adaptive",
    emoji: "adaptive",
    emojiFavorites: [],
    profileNotice: "正在读取口吻档案…",
    profileNoticeError: false,
    answerNotice: "",
    trialBusy: false,
    profileBusy: false,
    trialUsage: "",
    trialResult: "",
    trialError: false,
    samples: [],
    samplesLoaded: false,
    chat: [],
    chatOpen: false,
    chatBusy: false,
    chatStatus: "只在你点击发送后调用模型",
    chatStatusError: false,
    showEntryActions: true,
    nudgeActive: false,
    proposal: null,
    proposalMutationInFlight: false
  };
  let elements = null;
  let options = {};
  let draftTimer = null;
  let initialized = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function trimText(value, maxLength = MAX_CHAT_CONTENT_LENGTH) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .trim()
      .slice(0, maxLength);
  }

  function cleanAnswer(value, maxLength = MAX_ANSWER_LENGTH) {
    return trimText(value, maxLength)
      .replace(/【个人表达档案 v1】|【表达档案结束】/g, "")
      .trim();
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function storageGet(key) {
    return new Promise(resolve => {
      const storage = global.chrome?.storage?.local;
      if (!storage?.get) {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value?.[key] ?? null);
      };
      try {
        const result = storage.get(key, finish);
        if (result?.then) result.then(finish).catch(() => finish(null));
      } catch {
        finish(null);
      }
    });
  }

  function storageSet(value) {
    return new Promise(resolve => {
      const storage = global.chrome?.storage?.local;
      if (!storage?.set) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
      try {
        const result = storage.set(value, finish);
        if (result?.then) result.then(finish).catch(() => finish());
      } catch {
        finish();
      }
    });
  }

  function storageRemove(key) {
    return new Promise(resolve => {
      const storage = global.chrome?.storage?.local;
      if (!storage?.remove) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
      try {
        const result = storage.remove(key, finish);
        if (result?.then) result.then(finish).catch(() => finish());
      } catch {
        finish();
      }
    });
  }

  function runtimeSend(message) {
    if (typeof global.ZiliRuntime?.send !== "function") {
      return Promise.resolve({ ok: false, error: "runtime_unavailable" });
    }
    return global.ZiliRuntime.send(message, { timeoutMs: message.type === "ZILI_ASSIST" ? 20_000 : 15_000 });
  }

  function getSettings() {
    if (typeof options.getSettings !== "function") return Promise.resolve(null);
    return Promise.resolve(options.getSettings()).then(value => value || null).catch(() => null);
  }

  function saveSettings(patch, meta = {}) {
    if (typeof options.saveSettings !== "function") {
      return Promise.resolve({ ok: false, error: "settings_unavailable" });
    }
    return Promise.resolve(options.saveSettings(patch, meta)).catch(error => ({
      ok: false,
      error: error?.message || "settings_save_failed"
    }));
  }

  function getEngineStatus() {
    if (typeof options.getEngineStatus === "function") {
      return Promise.resolve(options.getEngineStatus()).catch(() => ({}));
    }
    return runtimeSend({ type: "GET_ENGINE_STATUS" });
  }

  function engineIsReady(response) {
    return Boolean(response?.ok && response?.status === "ready");
  }

  function usageLabel(usage) {
    if (!isPlainObject(usage)) return "";
    const total = Number(usage.totalTokens ?? usage.total_tokens);
    if (Number.isFinite(total) && total > 0) return `本次 ${total} Token`;
    const input = Number(usage.inputTokens ?? usage.prompt_tokens);
    const output = Number(usage.outputTokens ?? usage.completion_tokens);
    if (Number.isFinite(input) || Number.isFinite(output)) {
      return `本次 ${Number.isFinite(input) ? input : 0}+${Number.isFinite(output) ? output : 0} Token`;
    }
    return "";
  }

  function normalizeEmojiFavorites(value) {
    const source = Array.isArray(value)
      ? value
      : KNOWN_EMOJIS.filter(emoji => String(value || "").includes(emoji));
    return [...new Set(source.map(item => String(item)).filter(item => KNOWN_EMOJIS.includes(item)))];
  }

  function applySettingsPreferences(settings = {}) {
    if (PUNCTUATION_VALUES.has(settings.punctuation)) state.punctuation = settings.punctuation;
    if (EMOJI_VALUES.has(settings.emoji)) state.emoji = settings.emoji;
    state.emojiFavorites = normalizeEmojiFavorites(settings.emojiFavorites);
    if (elements?.reference && typeof settings.reference === "string") {
      elements.reference.value = settings.reference;
    }
    if (typeof settings.reference === "string") {
      state.hasSavedProfile = Boolean(trimText(settings.reference, MAX_REFERENCE_LENGTH));
    }
  }

  function setProfileNotice(text, isError = false) {
    state.profileNotice = String(text || "");
    state.profileNoticeError = isError;
    if (elements?.profileState) {
      elements.profileState.textContent = state.profileNotice;
      elements.profileState.className = isError ? "profile-state is-error" : "profile-state";
    }
  }

  function setPasteNotice(text, isError = false) {
    if (!elements?.pasteState) return;
    elements.pasteState.textContent = String(text || "");
    elements.pasteState.className = isError ? "profile-paste-state is-error" : "profile-paste-state";
  }

  function setSamplesNotice(text, isError = false) {
    if (!elements?.samplesState) return;
    elements.samplesState.textContent = String(text || "");
    elements.samplesState.className = isError ? "profile-samples-state is-error" : "profile-samples-state";
  }

  function queueDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      void storageSet({
        [STORAGE_KEYS.wizard]: {
          version: 2,
          sceneIndex: state.sceneIndex,
          answers: { ...state.answers },
          extraPhrase: state.extraPhrase,
          extraAvoid: state.extraAvoid,
          punctuation: state.punctuation,
          emoji: state.emoji,
          emojiFavorites: [...state.emojiFavorites]
        }
      });
    }, 140);
  }

  function restoreDraft(value) {
    if (!isPlainObject(value)) return;
    const answers = isPlainObject(value.answers) ? value.answers : {};
    for (const scene of SCENES) {
      const answer = cleanAnswer(answers[scene.id]);
      if (answer) state.answers[scene.id] = answer;
    }
    const index = Number(value.sceneIndex);
    state.sceneIndex = Number.isInteger(index) ? Math.max(0, Math.min(SCENES.length, index)) : 0;
    state.extraPhrase = cleanAnswer(value.extraPhrase, 240);
    state.extraAvoid = cleanAnswer(value.extraAvoid, 240);
    if (PUNCTUATION_VALUES.has(value.punctuation)) state.punctuation = value.punctuation;
    if (EMOJI_VALUES.has(value.emoji)) state.emoji = value.emoji;
    state.emojiFavorites = normalizeEmojiFavorites(value.emojiFavorites);
  }

  function buildCandidateProfile() {
    if (SCENES.some(scene => !cleanAnswer(state.answers[scene.id]))) return "";
    const lines = [
      "【个人表达档案 v1】",
      "【六类场景回答】"
    ];
    for (const scene of SCENES) {
      lines.push(`${scene.label}：${cleanAnswer(state.answers[scene.id], MAX_PROFILE_SCENE_LENGTH)}`);
    }
    const extraPhrase = cleanAnswer(state.extraPhrase, MAX_PROFILE_EXTRA_LENGTH);
    const extraAvoid = cleanAnswer(state.extraAvoid, MAX_PROFILE_EXTRA_LENGTH);
    if (extraPhrase || extraAvoid) {
      lines.push("【可选补充】");
      if (extraPhrase) lines.push(`常用开头或收尾：${extraPhrase}`);
      if (extraAvoid) lines.push(`不想出现：${extraAvoid}`);
    }
    lines.push(
      "【表达偏好】",
      `标点：${state.punctuation}`,
      `表情：${state.emoji}`,
      `常用 emoji（用户确认）：${state.emojiFavorites.join(" ") || "无"}`,
      "【使用边界】",
      "只学习句长、词序、口语节奏、标点、表情和判断方式；不照抄整句，不继承回答里的事实与身份。",
      "【表达档案结束】"
    );
    return lines.join("\n");
  }

  function renderEmojiFavorites() {
    elements.emojiFavorites?.querySelectorAll("[data-emoji]").forEach(button => {
      button.classList.toggle("is-selected", state.emojiFavorites.includes(button.dataset.emoji));
      button.setAttribute("aria-pressed", state.emojiFavorites.includes(button.dataset.emoji) ? "true" : "false");
    });
  }

  function renderCandidate() {
    const candidate = buildCandidateProfile();
    if (elements.candidatePreview) elements.candidatePreview.textContent = candidate || "答完 6 个场景后，这里会出现候选档案";
    if (elements.answerSummary) {
      const count = SCENES.filter(scene => cleanAnswer(state.answers[scene.id])).length;
      elements.answerSummary.textContent = `已完成 ${count} / ${SCENES.length} 个场景。每个场景都用你自己的话，字里只整理表达习惯。`;
    }
    return candidate;
  }

  function renderWizard() {
    const finished = state.sceneIndex >= SCENES.length;
    elements.profileProgress.textContent = finished
      ? "场景回答完成"
      : `场景 ${state.sceneIndex + 1} / ${SCENES.length}`;
    elements.profileDraftState.textContent = "逐题本地暂存";
    elements.questionBlock.hidden = finished;
    elements.finishPanel.hidden = !finished;
    elements.profileBack.disabled = state.sceneIndex <= 0;
    elements.profileNext.hidden = finished;
    if (!finished) {
      const scene = SCENES[state.sceneIndex];
      elements.profileQuestion.textContent = scene.question;
      elements.profileExample.textContent = scene.example;
      elements.profileAnswer.value = state.answers[scene.id] || "";
      elements.profileAnswerState.textContent = state.answerNotice;
      elements.profileAnswerState.className = state.answerNotice ? "profile-answer-state is-error" : "profile-answer-state";
    } else {
      elements.profileBack.textContent = "回到上一题";
      elements.answerSummary.textContent = "";
      elements.extraPhrase.value = state.extraPhrase;
      elements.extraAvoid.value = state.extraAvoid;
      elements.punctuation.value = state.punctuation;
      elements.emoji.value = state.emoji;
      renderCandidate();
      renderEmojiFavorites();
    }
    if (!finished) elements.profileBack.textContent = "上一题";
    setProfileNotice(state.profileNotice, state.profileNoticeError);
  }

  function renderMode() {
    const wizard = state.profileStarted && state.mode === "wizard";
    const paste = state.profileStarted && state.mode === "paste";
    elements.wizardPanel.hidden = !wizard;
    elements.pastePanel.hidden = !paste;
    elements.profileAssistant.classList.toggle("is-profile-open", state.profileStarted);
    elements.modeWizard.textContent = state.hasSavedProfile ? "修改表达" : "建立我的表达";
    elements.modePaste.textContent = state.hasSavedProfile ? "补充样例并分析" : "直接粘贴样例";
    elements.profileCollapse.hidden = !state.profileStarted;
    elements.modeWizard.classList.toggle("is-selected", state.mode === "wizard");
    elements.modePaste.classList.toggle("is-selected", state.mode === "paste");
    elements.modeWizard.setAttribute("aria-selected", state.mode === "wizard" ? "true" : "false");
    elements.modePaste.setAttribute("aria-selected", state.mode === "paste" ? "true" : "false");
  }

  function setMode(mode) {
    state.mode = mode === "paste" ? "paste" : "wizard";
    state.profileStarted = true;
    const disclosure = elements.profileAssistant?.closest("details");
    if (disclosure) disclosure.open = true;
    renderMode();
    if (state.mode === "wizard") {
      renderWizard();
      elements.profileAnswer?.focus();
    } else {
      if (!state.samplesLoaded) void loadSamples();
      elements.reference?.focus();
    }
  }

  function openWizard() {
    setMode(state.hasSavedProfile ? "paste" : "wizard");
    elements.profileAssistant?.scrollIntoView({ block: "nearest" });
  }

  function collapseProfile() {
    state.profileStarted = false;
    state.mode = state.hasSavedProfile ? "paste" : "wizard";
    renderMode();
  }

  function handleNext() {
    if (state.sceneIndex >= SCENES.length) return;
    const scene = SCENES[state.sceneIndex];
    const answer = cleanAnswer(elements.profileAnswer.value);
    if (!answer) {
      state.answerNotice = "先写一句你真实会说的话，再进入下一题";
      renderWizard();
      elements.profileAnswer.focus();
      return;
    }
    state.answerNotice = "";
    state.answers[scene.id] = answer;
    state.sceneIndex += 1;
    queueDraftSave();
    renderWizard();
  }

  function handleBack() {
    if (state.sceneIndex <= 0) return;
    if (state.sceneIndex < SCENES.length) {
      const scene = SCENES[state.sceneIndex];
      state.answers[scene.id] = cleanAnswer(elements.profileAnswer.value);
    }
    state.sceneIndex -= 1;
    state.answerNotice = "";
    queueDraftSave();
    renderWizard();
  }

  function restartWizard() {
    state.sceneIndex = 0;
    state.answers = {};
    state.extraPhrase = "";
    state.extraAvoid = "";
    state.answerNotice = "";
    state.trialResult = "";
    state.trialUsage = "";
    state.trialError = false;
    void storageRemove(STORAGE_KEYS.wizard);
    renderWizard();
    setProfileNotice("可以重新从第 1 个场景开始");
  }

  function mergeIntoExistingReference(existing, candidate) {
    if (typeof global.ZiliVoiceProfile?.mergeProfile === "function") {
      return global.ZiliVoiceProfile.mergeProfile(existing, candidate);
    }
    const source = trimText(existing, MAX_REFERENCE_LENGTH);
    return [candidate, source].filter(Boolean).join("\n\n").slice(0, MAX_REFERENCE_LENGTH);
  }

  async function saveProfile() {
    const candidate = buildCandidateProfile();
    if (!candidate) {
      setProfileNotice("6 个场景都要各写一句；可选补充题不影响保存", true);
      return;
    }
    state.profileBusy = true;
    elements.profileSave.disabled = true;
    setProfileNotice("正在读取最新设置并保存…");
    const current = await getSettings();
    if (!isPlainObject(current)) {
      state.profileBusy = false;
      elements.profileSave.disabled = false;
      setProfileNotice("没有读到最新设置，档案没有保存", true);
      return;
    }
    const reference = mergeIntoExistingReference(String(current.reference || ""), candidate);
    if (reference.length > MAX_REFERENCE_LENGTH) {
      state.profileBusy = false;
      elements.profileSave.disabled = false;
      setProfileNotice("新档案加原有样例超过 2400 字，请先在“直接粘贴样例”整理旧内容后再保存；原资料没有修改", true);
      return;
    }
    const patch = {
      reference,
      punctuation: state.punctuation,
      emoji: state.emoji,
      emojiFavorites: state.emojiFavorites.join(" ")
    };
    const response = await saveSettings(patch, { source: "profile" });
    state.profileBusy = false;
    elements.profileSave.disabled = false;
    if (!response?.ok) {
      setProfileNotice("档案保存失败，请稍后重试", true);
      return;
    }
    await storageRemove(STORAGE_KEYS.wizard);
    setProfileNotice("表达档案已建立，原来的口吻样例也保留了");
    state.trialResult = "";
    state.trialUsage = "";
    if (response.settings) applySettingsPreferences(response.settings);
    else state.hasSavedProfile = true;
    state.profileStarted = false;
    state.mode = "paste";
    renderMode();
    renderCandidate();
  }

  function trialErrorLabel(response) {
    const error = String(response?.error || "");
    if (/model_key_missing|key_missing/i.test(error)) return "先在“大模型接口”里保存 API Key，再试写";
    if (/runtime|message_port|empty_response/i.test(error)) return "后台暂时没有响应，请重开弹窗后再试";
    if (/timeout/i.test(error)) return "模型响应超时，请再试一次";
    return "试写没有成功，请稍后再试";
  }

  async function trialProfile() {
    const candidate = buildCandidateProfile();
    const text = trimText(elements.trialText.value, 1000);
    if (!candidate) {
      elements.trialResult.textContent = "先完成 6 个场景，才能用候选档案试写";
      elements.trialResult.className = "profile-trial-result is-error";
      return;
    }
    if (!text) {
      elements.trialResult.textContent = "先写一段想让字里回应的话";
      elements.trialResult.className = "profile-trial-result is-error";
      elements.trialText.focus();
      return;
    }
    const status = await getEngineStatus();
    if (!engineIsReady(status)) {
      elements.trialResult.textContent = "还没有可用的模型配置，先去“大模型接口”保存并检查 API";
      elements.trialResult.className = "profile-trial-result is-error";
      return;
    }
    state.trialBusy = true;
    elements.trialButton.disabled = true;
    elements.trialResult.className = "profile-trial-result";
    elements.trialResult.textContent = "正在试写…";
    elements.trialUsage.textContent = "";
    const response = await runtimeSend({
      type: "ZILI_ASSIST",
      action: "trial",
      text,
      profile: candidate
    });
    state.trialBusy = false;
    elements.trialButton.disabled = false;
    if (!response?.ok || typeof response.text !== "string") {
      elements.trialResult.textContent = trialErrorLabel(response);
      elements.trialResult.className = "profile-trial-result is-error";
      return;
    }
    elements.trialResult.textContent = response.text;
    elements.trialResult.className = "profile-trial-result";
    elements.trialUsage.textContent = usageLabel(response.usage);
  }

  function normalizeSample(sample, index) {
    if (!isPlainObject(sample)) return null;
    const text = trimText(sample.text, MAX_REFERENCE_LENGTH);
    if (!text) return null;
    return {
      id: trimText(sample.id || `sample-${index + 1}`, 100),
      context: trimText(sample.context || "未分类", 80),
      text
    };
  }

  function renderSamples() {
    elements.sampleList.replaceChildren();
    if (!state.samples.length) {
      setSamplesNotice("还没有已记住的样例");
      return;
    }
    for (const sample of state.samples) {
      const row = document.createElement("div");
      row.className = "profile-sample-row";
      const copy = document.createElement("div");
      copy.className = "profile-sample-copy";
      const context = document.createElement("span");
      context.className = "profile-sample-context";
      context.textContent = sample.context;
      const text = document.createElement("span");
      text.className = "profile-sample-text";
      text.textContent = sample.text;
      copy.append(context, text);
      const actions = document.createElement("div");
      actions.className = "profile-sample-actions";
      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.textContent = "使用";
      useButton.addEventListener("click", () => {
        elements.reference.value = sample.text;
        setPasteNotice("样例已放入上方文本框，确认后再保存");
        elements.reference.focus();
      });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => void deleteSample(sample, deleteButton));
      actions.append(useButton, deleteButton);
      row.append(copy, actions);
      elements.sampleList.appendChild(row);
    }
    setSamplesNotice(`已记住 ${state.samples.length} 条样例`);
  }

  async function loadSamples() {
    state.samplesLoaded = true;
    setSamplesNotice("正在读取本机样例…");
    const response = await runtimeSend({ type: "ZILI_PROFILE_LIST" });
    if (!response?.ok) {
      setSamplesNotice("暂时读不到已记住的样例，稍后可刷新重试", true);
      return;
    }
    state.samples = (Array.isArray(response.samples) ? response.samples : [])
      .map(normalizeSample)
      .filter(Boolean)
      .slice(0, MAX_SAMPLES);
    renderSamples();
  }

  async function deleteSample(sample, button) {
    if (!sample?.id) return;
    button.disabled = true;
    const response = await runtimeSend({ type: "ZILI_PROFILE_DELETE", id: sample.id });
    if (!response?.ok) {
      button.disabled = false;
      setSamplesNotice("样例没有删除成功，请重试", true);
      return;
    }
    state.samples = state.samples.filter(item => item.id !== sample.id);
    renderSamples();
  }

  async function savePasteReference() {
    const reference = trimText(elements.reference.value, MAX_REFERENCE_LENGTH);
    if (!reference) {
      setPasteNotice("先粘贴一段你真实写过的话", true);
      elements.reference.focus();
      return;
    }
    elements.savePaste.disabled = true;
    setPasteNotice("正在保存样例…");
    const response = await saveSettings({ reference }, { source: "paste" });
    elements.savePaste.disabled = false;
    if (!response?.ok) {
      setPasteNotice("样例没有保存成功，请重试", true);
      return;
    }
    elements.reference.value = response.settings?.reference || reference;
    if (response.settings) applySettingsPreferences(response.settings);
    else state.hasSavedProfile = true;
    state.profileStarted = false;
    state.mode = "paste";
    renderMode();
    setProfileNotice("表达档案已建立，可随时补充样例让它更准");
  }

  async function rememberSample() {
    const text = trimText(elements.reference.value, MAX_REFERENCE_LENGTH);
    if (!text) {
      setPasteNotice("先粘贴一段样例，再记住它", true);
      elements.reference.focus();
      return;
    }
    elements.rememberSample.disabled = true;
    setPasteNotice("正在记住样例…");
    const response = await runtimeSend({
      type: "ZILI_PROFILE_SAVE",
      context: trimText(elements.sampleContext.value, 80) || "未分类",
      text
    });
    elements.rememberSample.disabled = false;
    if (!response?.ok) {
      setPasteNotice("样例没有记住成功，请重试", true);
      return;
    }
    setPasteNotice("已记住这条样例");
    await loadSamples();
  }

  function normalizeChat(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => isPlainObject(item) && ["user", "assistant"].includes(item.role))
      .map(item => ({ role: item.role, content: trimText(item.content) }))
      .filter(item => item.content)
      .slice(-MAX_CHAT_MESSAGES);
  }

  function persistChat() {
    void storageSet({ [STORAGE_KEYS.chat]: state.chat.slice(-MAX_CHAT_MESSAGES) });
  }

  function appendChat(role, content) {
    const message = trimText(content);
    if (!message || !["user", "assistant"].includes(role)) return;
    state.chat.push({ role, content: message });
    state.chat = state.chat.slice(-MAX_CHAT_MESSAGES);
    persistChat();
    renderChat();
  }

  function renderChat() {
    elements.chatMessages.replaceChildren();
    for (const message of state.chat) {
      const bubble = document.createElement("div");
      bubble.className = `chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`;
      bubble.textContent = message.content;
      elements.chatMessages.appendChild(bubble);
    }
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    elements.chatPanel.hidden = !state.chatOpen;
    elements.chatToggle.setAttribute("aria-expanded", state.chatOpen ? "true" : "false");
    elements.chatToggle.setAttribute("aria-label", state.chatOpen ? "收起卡路里聊天" : "打开卡路里聊天");
    elements.chatEntryActions.replaceChildren();
    if (state.showEntryActions) {
      const actions = [
        ["profile", "建立口吻"],
        ["settings", "调设置"],
        ["write", "用口吻写"]
      ];
      if (state.nudgeActive) actions.push(["later", "以后再说"]);
      for (const [action, label] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.chatEntryAction = action;
        button.textContent = label;
        elements.chatEntryActions.appendChild(button);
      }
    }
    renderProposal();
  }

  function setChatStatus(text, isError = false) {
    state.chatStatus = String(text || "");
    state.chatStatusError = isError;
    elements.chatStatus.textContent = state.chatStatus;
    elements.chatStatus.className = isError ? "chat-status is-error" : "chat-status";
  }

  function focusChatInput(prefill = "") {
    if (prefill) elements.chatInput.value = prefill;
    elements.chatInput.focus();
  }

  function handleChatEntryAction(action) {
    if (action === "profile") {
      state.nudgeActive = false;
      openWizard();
      return;
    }
    if (action === "settings") {
      state.nudgeActive = false;
      if (typeof options.openSettings === "function") options.openSettings();
      setChatStatus("已打开口吻设置");
      return;
    }
    if (action === "write") {
      state.nudgeActive = false;
      setChatStatus("把想写的内容发给我，我会先和你确认");
      focusChatInput();
      return;
    }
    if (action === "later") {
      state.nudgeActive = false;
      renderChat();
      setChatStatus("好，之后想建立时再点“建立口吻”");
    }
  }

  function assistantErrorLabel(response) {
    const error = String(response?.error || "");
    if (/model_key_missing|key_missing/i.test(error)) return "还没配置 API。先到“大模型接口”保存并检查，配置好我再陪你聊。";
    if (/runtime|message_port|empty_response/i.test(error)) return "后台暂时没有响应，请重开弹窗后再试。";
    if (/timeout/i.test(error)) return "模型响应超时，请再试一次。";
    return "这次没有聊成，请稍后再试。";
  }

  function normalizeProposal(raw) {
    if (!isPlainObject(raw)) return null;
    const values = {};
    for (const key of PROPOSAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const value = raw[key];
      if (key === "reference") {
        const text = trimText(value, MAX_REFERENCE_LENGTH);
        if (text) values[key] = text;
        continue;
      }
      if (["human", "opinion", "question", "length"].includes(key)) {
        const number = Number(value);
        if (Number.isFinite(number)) values[key] = Math.max(0, Math.min(100, Math.round(number)));
        continue;
      }
      if (key === "style" && STYLE_VALUES.has(value)) {
        values[key] = value;
        continue;
      }
      if (key === "punctuation" && PUNCTUATION_VALUES.has(value)) {
        values[key] = value;
        continue;
      }
      if (key === "emoji" && EMOJI_VALUES.has(value)) {
        values[key] = value;
        continue;
      }
      if (key === "emojiFavorites") {
        values[key] = normalizeEmojiFavorites(value);
      }
    }
    return Object.keys(values).length ? values : null;
  }

  function pickProposalValues(settings, keys) {
    const picked = {};
    for (const key of keys) picked[key] = settings?.[key];
    return picked;
  }

  function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function proposalValueLabel(key, value) {
    if (key === "punctuation") return PUNCTUATION_LABELS[value] || String(value);
    if (key === "emoji") return EMOJI_LABELS[value] || String(value);
    if (key === "style") return STYLE_LABELS[value] || String(value);
    if (key === "emojiFavorites") return Array.isArray(value) ? value.join(" ") || "无" : String(value || "无");
    if (key === "reference") return `${String(value || "").length} 字的候选档案`;
    return `${value}%`;
  }

  function renderProposal() {
    if (!elements?.proposal) return;
    elements.proposal.replaceChildren();
    const proposal = state.proposal;
    if (!proposal) {
      elements.proposal.hidden = true;
      return;
    }
    elements.proposal.hidden = false;
    const title = document.createElement("p");
    title.className = "chat-proposal-title";
    title.textContent = proposal.status === "pending"
      ? "模型给了一份口吻设置建议"
      : proposal.status === "applied"
        ? "这份口吻建议已写入"
        : proposal.status === "undone"
          ? "这份口吻建议已撤销"
          : "这份口吻建议未写入";
    const list = document.createElement("div");
    list.className = "chat-proposal-list";
    for (const key of Object.keys(proposal.values)) {
      const row = document.createElement("div");
      row.className = "chat-proposal-row";
      const label = document.createElement("span");
      label.textContent = PROPOSAL_LABELS[key] || key;
      const value = document.createElement("span");
      value.className = "chat-proposal-value";
      value.textContent = proposalValueLabel(key, proposal.values[key]);
      row.append(label, value);
      list.appendChild(row);
    }
    const status = document.createElement("p");
    status.className = "chat-proposal-state";
    status.textContent = proposal.statusText || "只展示允许调整的项目，确认后才会保存";
    const actions = document.createElement("div");
    actions.className = "chat-proposal-actions";
    if (proposal.status === "pending") {
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.textContent = "确认写入";
      confirmButton.disabled = state.proposalMutationInFlight;
      confirmButton.addEventListener("click", () => void confirmProposal());
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.textContent = "撤销建议";
      dismissButton.disabled = state.proposalMutationInFlight;
      dismissButton.addEventListener("click", () => {
        state.proposal = null;
        renderProposal();
      });
      actions.append(confirmButton, dismissButton);
    } else if (proposal.status === "applied") {
      const undoButton = document.createElement("button");
      undoButton.type = "button";
      undoButton.textContent = "撤销本次修改";
      undoButton.disabled = state.proposalMutationInFlight || proposal.invalidated === true;
      undoButton.addEventListener("click", () => void undoProposal());
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "收起建议";
      closeButton.addEventListener("click", () => {
        state.proposal = null;
        renderProposal();
      });
      actions.append(undoButton, closeButton);
    }
    elements.proposal.append(title, list, status, actions);
  }

  function setProposal(raw) {
    const values = normalizeProposal(raw);
    if (!values) return;
    state.proposal = {
      values,
      status: "pending",
      statusText: "只展示允许调整的项目，确认后才会保存",
      before: null,
      applied: null,
      invalidated: false
    };
    renderProposal();
  }

  function notifySettingsChanged() {
    if (
      state.proposal
      && state.proposal.status === "applied"
      && !state.proposalMutationInFlight
    ) {
      state.proposal.invalidated = true;
      state.proposal.statusText = "设置后来有变化，为避免覆盖你的新修改，这次不能撤销。";
      renderProposal();
    }
  }

  async function confirmProposal() {
    const proposal = state.proposal;
    if (!proposal || proposal.status !== "pending") return;
    state.proposalMutationInFlight = true;
    proposal.statusText = "正在读取最新设置…";
    renderProposal();
    const current = await getSettings();
    const keys = Object.keys(proposal.values);
    proposal.before = pickProposalValues(current, keys);
    const response = await saveSettings(proposal.values, { source: "proposal" });
    state.proposalMutationInFlight = false;
    if (!response?.ok) {
      proposal.statusText = "保存失败，没有改动设置";
      renderProposal();
      return;
    }
    const saved = isPlainObject(response.settings) ? response.settings : { ...current, ...proposal.values };
    proposal.applied = pickProposalValues(saved, keys);
    proposal.status = "applied";
    proposal.statusText = "只保留这次建议涉及的字段；之后改过设置就不会强行覆盖。";
    if (typeof options.onSettingsSaved === "function") options.onSettingsSaved(saved, { source: "proposal" });
    renderProposal();
  }

  async function undoProposal() {
    const proposal = state.proposal;
    if (!proposal || proposal.status !== "applied") return;
    if (proposal.invalidated) {
      proposal.statusText = "设置后来有变化，为避免覆盖你的新修改，这次不能撤销。";
      renderProposal();
      return;
    }
    state.proposalMutationInFlight = true;
    proposal.statusText = "正在确认设置没有被后来改过…";
    renderProposal();
    const current = await getSettings();
    const keys = Object.keys(proposal.values);
    const changed = keys.some(key => !sameValue(current?.[key], proposal.applied?.[key]));
    if (changed) {
      state.proposalMutationInFlight = false;
      proposal.invalidated = true;
      proposal.statusText = "设置后来有变化，为避免覆盖你的新修改，这次不能撤销。";
      renderProposal();
      return;
    }
    const response = await saveSettings(proposal.before, { source: "proposal-undo" });
    state.proposalMutationInFlight = false;
    if (!response?.ok) {
      proposal.statusText = "撤销没有保存成功，当前设置没有被覆盖。";
      renderProposal();
      return;
    }
    proposal.status = "undone";
    proposal.statusText = "只还原了这次建议涉及的字段。";
    renderProposal();
  }

  async function sendChat() {
    const text = trimText(elements.chatInput.value);
    if (!text || state.chatBusy) return;
    elements.chatInput.value = "";
    state.showEntryActions = false;
    appendChat("user", text);
    const status = await getEngineStatus();
    if (!engineIsReady(status)) {
      appendChat("assistant", "还没配置可用的 API。先去“大模型接口”保存并检查，配置好我再陪你聊。 ");
      setChatStatus("等待配置 API", true);
      return;
    }
    state.chatBusy = true;
    elements.chatSend.disabled = true;
    setChatStatus("正在聊…");
    const history = state.chat
      .slice(0, -1)
      .slice(-MAX_CHAT_MESSAGES)
      .map(item => ({ role: item.role, content: item.content }));
    const response = await runtimeSend({
      type: "ZILI_ASSIST",
      action: "chat",
      text,
      history
    });
    state.chatBusy = false;
    elements.chatSend.disabled = false;
    if (!response?.ok || typeof response.text !== "string") {
      appendChat("assistant", assistantErrorLabel(response));
      setChatStatus("这次没有成功", true);
      return;
    }
    appendChat("assistant", response.text);
    const usage = usageLabel(response.usage);
    setChatStatus(usage ? `已回复 · ${usage}` : "已回复");
    if (response.proposal) setProposal(response.proposal);
  }

  async function maybeShowNudge(settings, status) {
    if (String(settings?.reference || "").trim() || !engineIsReady(status)) return;
    const shown = await storageGet(STORAGE_KEYS.nudge);
    if (shown === true) return;
    await storageSet({ [STORAGE_KEYS.nudge]: true });
    state.nudgeActive = true;
    appendChat("assistant", "模型已经配置好了。要不要先建立一份口吻档案？不急，之后再说也行。");
    renderChat();
  }

  async function restoreChat() {
    state.chat = normalizeChat(await storageGet(STORAGE_KEYS.chat));
    if (!state.chat.length) {
      state.chat = [{
        role: "assistant",
        content: "我是卡路里。你可以先建立口吻、调设置，或者直接把想写的内容发给我。"
      }];
      persistChat();
    }
    state.showEntryActions = state.chat.length <= 1;
  }

  function clearChat() {
    state.chat = [{
      role: "assistant",
      content: "对话已清空。你可以先建立口吻、调设置，或者直接把想写的内容发给我。"
    }];
    state.showEntryActions = true;
    state.nudgeActive = false;
    state.proposal = null;
    persistChat();
    setChatStatus("只在你点击发送后调用模型");
    renderChat();
  }

  function bindEvents() {
    elements.modeWizard.addEventListener("click", () => setMode("wizard"));
    elements.modePaste.addEventListener("click", () => setMode("paste"));
    elements.profileCollapse.addEventListener("click", collapseProfile);
    elements.profileNext.addEventListener("click", handleNext);
    elements.profileBack.addEventListener("click", handleBack);
    elements.profileAnswer.addEventListener("input", () => {
      if (state.sceneIndex >= SCENES.length) return;
      state.answers[SCENES[state.sceneIndex].id] = elements.profileAnswer.value.slice(0, MAX_ANSWER_LENGTH);
      state.answerNotice = "";
      queueDraftSave();
    });
    elements.extraPhrase.addEventListener("input", () => {
      state.extraPhrase = elements.extraPhrase.value.slice(0, 240);
      queueDraftSave();
    });
    elements.extraAvoid.addEventListener("input", () => {
      state.extraAvoid = elements.extraAvoid.value.slice(0, 240);
      queueDraftSave();
    });
    elements.punctuation.addEventListener("change", () => {
      state.punctuation = PUNCTUATION_VALUES.has(elements.punctuation.value) ? elements.punctuation.value : "adaptive";
      queueDraftSave();
    });
    elements.emoji.addEventListener("change", () => {
      state.emoji = EMOJI_VALUES.has(elements.emoji.value) ? elements.emoji.value : "adaptive";
      queueDraftSave();
    });
    elements.emojiFavorites.addEventListener("click", event => {
      const button = event.target.closest("[data-emoji]");
      if (!button || !KNOWN_EMOJIS.includes(button.dataset.emoji)) return;
      const emoji = button.dataset.emoji;
      state.emojiFavorites = state.emojiFavorites.includes(emoji)
        ? state.emojiFavorites.filter(item => item !== emoji)
        : [...state.emojiFavorites, emoji];
      renderEmojiFavorites();
      queueDraftSave();
    });
    elements.trialButton.addEventListener("click", () => void trialProfile());
    elements.profileSave.addEventListener("click", () => void saveProfile());
    elements.profileRestart.addEventListener("click", restartWizard);
    elements.savePaste.addEventListener("click", () => void savePasteReference());
    elements.rememberSample.addEventListener("click", () => void rememberSample());
    elements.refreshSamples.addEventListener("click", () => void loadSamples());
    elements.chatToggle.addEventListener("click", () => {
      state.chatOpen = !state.chatOpen;
      renderChat();
      if (state.chatOpen) elements.chatInput.focus();
    });
    elements.chatCollapse.addEventListener("click", () => {
      state.chatOpen = false;
      renderChat();
    });
    elements.chatForm.addEventListener("submit", event => {
      event.preventDefault();
      void sendChat();
    });
    elements.chatInput.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendChat();
      }
    });
    elements.chatClear.addEventListener("click", clearChat);
    elements.chatEntryActions.addEventListener("click", event => {
      const button = event.target.closest("[data-chat-entry-action]");
      if (button) handleChatEntryAction(button.dataset.chatEntryAction);
    });
  }

  function findElements() {
    elements = {
      profileAssistant: byId("profile-assistant"),
      profileState: byId("profile-assistant-state"),
      modeWizard: byId("profileModeWizard"),
      modePaste: byId("profileModePaste"),
      profileCollapse: byId("profileCollapse"),
      wizardPanel: byId("profileWizardPanel"),
      pastePanel: byId("profilePastePanel"),
      profileProgress: byId("profileProgress"),
      profileDraftState: byId("profileDraftState"),
      questionBlock: byId("profileQuestionBlock"),
      profileQuestion: byId("profileQuestion"),
      profileExample: byId("profileExample"),
      profileAnswer: byId("profileAnswer"),
      profileAnswerState: byId("profileAnswerState"),
      profileBack: byId("profileBack"),
      profileNext: byId("profileNext"),
      finishPanel: byId("profileFinishPanel"),
      answerSummary: byId("profileAnswerSummary"),
      extraPhrase: byId("profileExtraPhrase"),
      extraAvoid: byId("profileExtraAvoid"),
      punctuation: byId("profilePunctuation"),
      emoji: byId("profileEmoji"),
      emojiFavorites: byId("profileEmojiFavorites"),
      candidatePreview: byId("profileCandidatePreview"),
      trialText: byId("profileTrialText"),
      trialButton: byId("profileTrial"),
      trialUsage: byId("profileTrialUsage"),
      trialResult: byId("profileTrialResult"),
      profileSave: byId("profileSave"),
      profileRestart: byId("profileRestart"),
      reference: byId("reference"),
      savePaste: byId("profileSavePaste"),
      sampleContext: byId("profileSampleContext"),
      rememberSample: byId("profileRememberSample"),
      pasteState: byId("profilePasteState"),
      refreshSamples: byId("profileRefreshSamples"),
      sampleList: byId("profileSampleList"),
      samplesState: byId("profileSamplesState"),
      chatPanel: byId("zili-chat-panel"),
      chatToggle: byId("zili-chat-toggle"),
      chatCollapse: byId("zili-chat-collapse"),
      chatMessages: byId("zili-chat-messages"),
      chatEntryActions: byId("zili-chat-entry-actions"),
      proposal: byId("zili-chat-proposal"),
      chatForm: byId("zili-chat-form"),
      chatInput: byId("zili-chat-input"),
      chatSend: byId("zili-chat-send"),
      chatClear: byId("zili-chat-clear"),
      chatStatus: byId("zili-chat-status")
    };
    return Object.values(elements).every(Boolean);
  }

  async function initialize(config = {}) {
    options = config;
    if (!findElements()) return false;
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    restoreDraft(await storageGet(STORAGE_KEYS.wizard));
    await restoreChat();
    const [settings, engineStatus] = await Promise.all([getSettings(), getEngineStatus()]);
    applySettingsPreferences(settings);
    // 打开就明确告诉用户这台浏览器里有没有口吻档案、有多少字，不让人靠猜。
    const savedChars = String(settings?.reference || "").trim().length;
    if (!settings) setProfileNotice("暂时读不到口吻档案，重开弹窗再看一次", true);
    else setProfileNotice(state.hasSavedProfile
      ? `已有口吻档案 ${savedChars} 字，点“直接粘贴样例”可查看和修改`
      : "这个浏览器里还没有口吻档案：回答 6 个场景，或直接粘贴样例");
    renderMode();
    renderWizard();
    renderChat();
    void maybeShowNudge(settings, engineStatus);
    return true;
  }

  function notifySettingsSaved(nextSettings, meta = {}) {
    applySettingsPreferences(nextSettings || {});
    if (!state.profileStarted) {
      setProfileNotice(state.hasSavedProfile ? "表达档案已建立，可补充样例让它更准" : "先建立我的表达，也可以直接粘贴样例");
      renderMode();
    }
    if (
      state.proposal
      && state.proposal.status === "applied"
      && !state.proposalMutationInFlight
      && meta.source !== "proposal"
      && meta.source !== "proposal-undo"
    ) {
      state.proposal.invalidated = true;
      state.proposal.statusText = "设置后来有变化，为避免覆盖你的新修改，这次不能撤销。";
      renderProposal();
    }
    if (state.mode === "wizard" && state.sceneIndex >= SCENES.length) renderWizard();
  }

  global.ZiliSettingsAssistant = {
    init: initialize,
    openWizard,
    notifySettingsChanged,
    notifySettingsSaved,
    buildCandidateProfile,
    scenes: SCENES,
    proposalKeys: [...PROPOSAL_KEYS]
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
