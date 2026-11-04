(function initZiliSettingsAssistant(global) {
  "use strict";

  const STORAGE_KEYS = {
    wizard: "ziliProfileWizardDraftV3",
    chat: "ziliAssistantChatV1",
    nudge: "ziliProfileNudgeShownV1"
  };
  const MAX_ANSWER_LENGTH = 200;
  const MAX_PROFILE_SCENE_LENGTH = 180;
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
  // 引导问题照作者本人当初逐题确认口吻的方式设计：每题一个真实场景，参考答案就是作者自己的说法，
  // 新用户可以照着改成自己的，也可以点参考直接用，答完就得到一份同样结构的口吻档案。
  const SCENES = [
    { id: "lightAgree", label: "轻认同", question: "别人说的你觉得还行，你一般怎么回？", example: "这可以 / 这个不错" },
    { id: "strongAgree", label: "强认同", question: "特别认同、觉得很对的时候，你会怎么说？", example: "太行 / 太可以了" },
    { id: "confirm", label: "说中了", question: "对方说中了你的意思，你怎么接？", example: "确实 是这意思" },
    { id: "praise", label: "夸人和惊喜", question: "看到意外的好东西，或别人做得好，你会怎么说？", example: "有点东西 我怎么没想到呢 什么时候开源 我试试看" },
    { id: "doubt", label: "不太认同", question: "不太同意对方时，你通常怎么开口？", example: "是这样吗 真的吗" },
    { id: "challenged", label: "被质疑", question: "别人质疑你、觉得你不行时，你怎么回？", example: "确实 想法算不算 你可以试一下 还是有点不一样" },
    { id: "learn", label: "请教", question: "真想弄明白又听不懂时，你会怎么问？", example: "有点东西 感谢大佬 这个是干嘛的" },
    { id: "funny", label: "好笑和安慰", question: "看到好笑的事，或对方翻车了，你会怎么说？", example: "笑死 / 哈哈哈哈 辛苦了 也是一种进步" },
    { id: "words", label: "用词习惯", question: "打字时常用、和绝对不用的词有哪些？方言也算", example: "常用：这样子 有没有 啥 我们；不用：咱们 咋整" },
    { id: "addressEmoji", label: "称呼和表情", question: "你怎么称呼别人？常用哪些表情，分别是什么意思？", example: "一般不加称呼 熟人叫兄弟；常用 😂 😭 👍，🙂 是呵呵的意思" }
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
    const lines = ["【个人口吻档案】"];
    for (const scene of SCENES) {
      lines.push(`${scene.label}：${cleanAnswer(state.answers[scene.id], MAX_PROFILE_SCENE_LENGTH)}`);
    }
    lines.push(
      `标点：${PUNCTUATION_LABELS[state.punctuation] || "看场景"}`,
      `表情：${EMOJI_LABELS[state.emoji] || "看场景"}`,
      "【使用边界】一条回复只用一个主要反应，按场景挑上面的说法，不每句都塞口头词，不照抄整句，不编造事实和经历；不用空预告、空喊重点和工整对照这类 AI 句式。"
    );
    return lines.join("\n");
  }

  function renderCandidate() {
    const candidate = buildCandidateProfile();
    if (elements.candidatePreview) elements.candidatePreview.textContent = candidate || "答完所有问题后，这里会出现口吻档案";
    if (elements.answerSummary) {
      const count = SCENES.filter(scene => cleanAnswer(state.answers[scene.id])).length;
      elements.answerSummary.textContent = `已答 ${count} / ${SCENES.length} 题。保存后会替换当前的口吻档案。`;
    }
    return candidate;
  }

  function renderWizard() {
    const finished = state.sceneIndex >= SCENES.length;
    elements.profileProgress.textContent = finished
      ? "都答完了，看一眼再保存"
      : `问题 ${state.sceneIndex + 1} / ${SCENES.length}`;
    elements.questionBlock.hidden = finished;
    elements.finishPanel.hidden = !finished;
    elements.profileBack.disabled = state.sceneIndex <= 0;
    elements.profileNext.hidden = finished;
    if (!finished) {
      const scene = SCENES[state.sceneIndex];
      elements.profileQuestion.textContent = scene.question;
      elements.profileExample.textContent = `参考：${scene.example}`;
      elements.profileAnswer.value = state.answers[scene.id] || "";
      elements.profileAnswerState.textContent = state.answerNotice;
      elements.profileAnswerState.className = state.answerNotice ? "profile-answer-state is-error" : "profile-answer-state";
    } else {
      elements.profileBack.textContent = "回到上一题";
      elements.answerSummary.textContent = "";
      elements.punctuation.value = state.punctuation;
      elements.emoji.value = state.emoji;
      renderCandidate();
    }
    if (!finished) elements.profileBack.textContent = "上一题";
    setProfileNotice(state.profileNotice, state.profileNoticeError);
  }

  // 口吻只有一个窗口：平时显示当前档案（可直接改或粘贴），点“一步步设置口吻”切到引导问答，答完保存再回来。
  function renderMode() {
    const wizard = state.profileStarted && state.mode === "wizard";
    elements.wizardPanel.hidden = !wizard;
    elements.pastePanel.hidden = wizard;
    elements.profileAssistant.classList.toggle("is-profile-open", wizard);
    elements.modeWizard.textContent = state.hasSavedProfile ? "重新一步步设置" : "一步步设置口吻";
  }

  function setMode(mode) {
    state.mode = mode === "paste" ? "paste" : "wizard";
    state.profileStarted = state.mode === "wizard";
    const disclosure = elements.profileAssistant?.closest("details");
    if (disclosure) disclosure.open = true;
    renderMode();
    if (state.mode === "wizard") {
      renderWizard();
      elements.profileAnswer?.focus();
    } else {
      elements.reference?.focus();
    }
  }

  function openWizard() {
    setMode("wizard");
    elements.profileAssistant?.scrollIntoView({ block: "nearest" });
  }

  function collapseProfile() {
    state.profileStarted = false;
    state.mode = "paste";
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
    setProfileNotice("可以重新从第 1 题开始");
  }

  async function saveProfile() {
    const candidate = buildCandidateProfile();
    if (!candidate) {
      setProfileNotice("每道题都要写一句才能保存", true);
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
    const reference = candidate.slice(0, MAX_REFERENCE_LENGTH);
    const patch = {
      reference,
      punctuation: state.punctuation,
      emoji: state.emoji
    };
    const response = await saveSettings(patch, { source: "profile" });
    state.profileBusy = false;
    elements.profileSave.disabled = false;
    if (!response?.ok) {
      setProfileNotice("档案保存失败，请稍后重试", true);
      return;
    }
    await storageRemove(STORAGE_KEYS.wizard);
    if (response.settings) applySettingsPreferences(response.settings);
    else state.hasSavedProfile = true;
    elements.reference.value = response.settings?.reference || reference;
    setProfileNotice(`已保存口吻档案 ${elements.reference.value.trim().length} 字，下面可以直接改`);
    state.sceneIndex = 0;
    state.answers = {};
    collapseProfile();
  }

  async function savePasteReference() {
    const reference = trimText(elements.reference.value, MAX_REFERENCE_LENGTH);
    if (!reference) {
      setPasteNotice("先写或粘贴一段口吻内容", true);
      elements.reference.focus();
      return;
    }
    elements.savePaste.disabled = true;
    setPasteNotice("正在保存…");
    const response = await saveSettings({ reference }, { source: "paste" });
    elements.savePaste.disabled = false;
    if (!response?.ok) {
      setPasteNotice("没有保存成功，请重试", true);
      return;
    }
    elements.reference.value = response.settings?.reference || reference;
    if (response.settings) applySettingsPreferences(response.settings);
    else state.hasSavedProfile = true;
    state.profileStarted = false;
    state.mode = "paste";
    renderMode();
    setPasteNotice("");
    setProfileNotice(`已保存口吻档案 ${elements.reference.value.trim().length} 字`);
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
    elements.profileCollapse.addEventListener("click", collapseProfile);
    elements.profileNext.addEventListener("click", handleNext);
    elements.profileBack.addEventListener("click", handleBack);
    elements.profileExample.addEventListener("click", () => {
      const scene = SCENES[state.sceneIndex];
      if (!scene) return;
      elements.profileAnswer.value = scene.example;
      state.answers[scene.id] = scene.example;
      state.answerNotice = "";
      queueDraftSave();
      elements.profileAnswer.focus();
    });
    elements.profileAnswer.addEventListener("input", () => {
      if (state.sceneIndex >= SCENES.length) return;
      state.answers[SCENES[state.sceneIndex].id] = elements.profileAnswer.value.slice(0, MAX_ANSWER_LENGTH);
      state.answerNotice = "";
      queueDraftSave();
    });
    elements.punctuation.addEventListener("change", () => {
      state.punctuation = PUNCTUATION_VALUES.has(elements.punctuation.value) ? elements.punctuation.value : "adaptive";
      queueDraftSave();
      renderCandidate();
    });
    elements.emoji.addEventListener("change", () => {
      state.emoji = EMOJI_VALUES.has(elements.emoji.value) ? elements.emoji.value : "adaptive";
      queueDraftSave();
      renderCandidate();
    });
    elements.profileSave.addEventListener("click", () => void saveProfile());
    elements.profileRestart.addEventListener("click", restartWizard);
    elements.savePaste.addEventListener("click", () => void savePasteReference());
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
      profileCollapse: byId("profileCollapse"),
      wizardPanel: byId("profileWizardPanel"),
      pastePanel: byId("profilePastePanel"),
      profileProgress: byId("profileProgress"),
      questionBlock: byId("profileQuestionBlock"),
      profileQuestion: byId("profileQuestion"),
      profileExample: byId("profileExample"),
      profileAnswer: byId("profileAnswer"),
      profileAnswerState: byId("profileAnswerState"),
      profileBack: byId("profileBack"),
      profileNext: byId("profileNext"),
      finishPanel: byId("profileFinishPanel"),
      answerSummary: byId("profileAnswerSummary"),
      punctuation: byId("profilePunctuation"),
      emoji: byId("profileEmoji"),
      candidatePreview: byId("profileCandidatePreview"),
      profileSave: byId("profileSave"),
      profileRestart: byId("profileRestart"),
      reference: byId("reference"),
      savePaste: byId("profileSavePaste"),
      pasteState: byId("profilePasteState"),
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
      ? `已有口吻档案 ${savedChars} 字，下面可以直接改`
      : "这个浏览器里还没有口吻档案：点“一步步设置口吻”回答 10 个问题，或直接粘贴你写过的话");
    renderMode();
    renderWizard();
    renderChat();
    void maybeShowNudge(settings, engineStatus);
    return true;
  }

  function notifySettingsSaved(nextSettings, meta = {}) {
    applySettingsPreferences(nextSettings || {});
    if (!state.profileStarted) {
      setProfileNotice(state.hasSavedProfile ? `已有口吻档案 ${String(nextSettings?.reference || "").trim().length} 字，下面可以直接改` : "这个浏览器里还没有口吻档案：点“一步步设置口吻”回答 10 个问题，或直接粘贴你写过的话");
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
