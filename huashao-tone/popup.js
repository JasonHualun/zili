const form = {
  enabled: document.querySelector("#enabled"),
  autoRewrite: document.querySelector("#autoRewrite"),
  architectMode: document.querySelector("#architectMode"),
  rewriteOptions: document.querySelector("#rewrite-options"),
  manualWritingGuide: document.querySelector("#manual-writing-guide"),
  autoApplyRewrite: document.querySelector("#autoApplyRewrite"),
  selectionComments: document.querySelector("#selectionComments"),
  selectionOptions: document.querySelector("#selection-options"),
  termExplanation: document.querySelector("#termExplanation"),
  questionAnswer: document.querySelector("#questionAnswer"),
  selectionReply: document.querySelector("#selectionReply"),
  floatingCompanion: document.querySelector("#floatingCompanion"),
  themes: document.querySelector("#themes"),
  toneSettings: document.querySelector("#tone-settings"),
  engineSettings: document.querySelector("#engine-settings"),
  voiceBuilder: document.querySelector("#voice-builder"),
  voiceScene: document.querySelector("#voiceScene"),
  voiceTone: document.querySelector("#voiceTone"),
  voiceDisagreement: document.querySelector("#voiceDisagreement"),
  voiceAgree: document.querySelector("#voiceAgree"),
  voiceStrongAgree: document.querySelector("#voiceStrongAgree"),
  voiceDoubt: document.querySelector("#voiceDoubt"),
  voiceSurprise: document.querySelector("#voiceSurprise"),
  voiceAvoid: document.querySelector("#voiceAvoid"),
  voiceSignature: document.querySelector("#voiceSignature"),
  voiceSamples: document.querySelector("#voiceSamples"),
  voiceBuilderState: document.querySelector("#voice-builder-state"),
  copyVoiceTemplate: document.querySelector("#copyVoiceTemplate"),
  buildVoiceProfile: document.querySelector("#buildVoiceProfile"),
  triggerRepliesEnabled: document.querySelector("#triggerRepliesEnabled"),
  addTriggerReply: document.querySelector("#addTriggerReply"),
  triggerReplyList: document.querySelector("#triggerReplyList"),
  triggerReplyState: document.querySelector("#triggerReplyState"),
  triggerReplyDialog: document.querySelector("#triggerReplyDialog"),
  triggerReplyForm: document.querySelector("#triggerReplyForm"),
  triggerReplyDialogTitle: document.querySelector("#triggerReplyDialogTitle"),
  triggerReplyId: document.querySelector("#triggerReplyId"),
  triggerReplyPattern: document.querySelector("#triggerReplyPattern"),
  triggerReplyText: document.querySelector("#triggerReplyText"),
  triggerReplyDialogState: document.querySelector("#triggerReplyDialogState"),
  cancelTriggerReply: document.querySelector("#cancelTriggerReply"),
  cancelTriggerReplyTop: document.querySelector("#cancelTriggerReplyTop"),
  methodCardCount: document.querySelector("#methodCardCount"),
  methodCardList: document.querySelector("#methodCardList"),
  methodCardState: document.querySelector("#methodCardState"),
  methodLibraryDetails: document.querySelector("#methodLibraryDetails"),
  addMethodCard: document.querySelector("#addMethodCard"),
  methodCardDialog: document.querySelector("#methodCardDialog"),
  methodCardForm: document.querySelector("#methodCardForm"),
  methodCardDialogTitle: document.querySelector("#methodCardDialogTitle"),
  methodCardInput: document.querySelector("#methodCardInput"),
  methodCardPreview: document.querySelector("#methodCardPreview"),
  methodCardPreviewName: document.querySelector("#methodCardPreviewName"),
  methodCardPreviewMeta: document.querySelector("#methodCardPreviewMeta"),
  methodCardPreviewSummary: document.querySelector("#methodCardPreviewSummary"),
  methodCardPreviewPrompt: document.querySelector("#methodCardPreviewPrompt"),
  methodCardDialogState: document.querySelector("#methodCardDialogState"),
  methodCardAsk: document.querySelector("#methodCardAsk"),
  saveMethodCard: document.querySelector("#saveMethodCard"),
  cancelMethodCard: document.querySelector("#cancelMethodCard"),
  cancelMethodCardTop: document.querySelector("#cancelMethodCardTop"),
  presets: document.querySelector("#presets"),
  reference: document.querySelector("#reference"),
  saveState: document.querySelector("#save-state"),
  connectionState: document.querySelector("#connection-state"),
  checkConnection: document.querySelector("#check-connection"),
  modelProvider: document.querySelector("#modelProvider"),
  modelVersion: document.querySelector("#modelVersion"),
  modelVersionLabel: document.querySelector('label[for="modelVersion"]'),
  customProviderFields: document.querySelector("#customProviderFields"),
  customApiUrl: document.querySelector("#customApiUrl"),
  customModelId: document.querySelector("#customModelId"),
  customModelList: document.querySelector("#customModelList"),
  fetchCustomModels: document.querySelector("#fetchCustomModels"),
  customVision: document.querySelector("#customVision"),
  customWebSearch: document.querySelector("#customWebSearch"),
  providerModel: document.querySelector("#provider-model"),
  modelDetails: document.querySelector("#model-details"),
  modelUseCase: document.querySelector("#model-use-case"),
  modelPrice: document.querySelector("#model-price"),
  modelId: document.querySelector("#model-id"),
  captureRegion: document.querySelector("#captureRegion"),
  screenshotModelState: document.querySelector("#screenshot-model-state"),
  screenshotState: document.querySelector("#screenshot-state"),
  copyMode: document.querySelector("#copyMode"),
  copyModeState: document.querySelector("#copyModeState"),
  videoTranslation: document.querySelector("#videoTranslation"),
  videoTranslationState: document.querySelector("#videoTranslationState"),
  enabledState: document.querySelector("#enabled-state"),
  writingStatusSummary: document.querySelector("#writing-status-summary"),
  providerKeyLabel: document.querySelector("#provider-key-label"),
  providerApiKey: document.querySelector("#providerApiKey"),
  saveProviderKey: document.querySelector("#saveProviderKey"),
  clearProviderKey: document.querySelector("#clearProviderKey"),
  keyState: document.querySelector("#key-state"),
  saveButton: document.querySelector("#save"),
  pageFilter: document.querySelector("#pageFilter"),
  pageFilterInstruction: document.querySelector("#pageFilterInstruction"),
  collectAgent: document.querySelector("#collectAgent"),
  collectMatch: document.querySelector("#collectMatch"),
  collectSetup: document.querySelector("#collectSetup"),
  openSettings: document.querySelector("#openSettings"),
  settingsPanel: document.querySelector("#settingsPanel"),
  pageCleanState: document.querySelector("#pageCleanState")
};
// Only what the user types in settings is stored here; the old key held whatever was last run from the removed inline form.
const PAGE_FILTER_KEY = "ziliPageFilterRule";
void chrome.storage.local.remove("ziliPageFilterInstruction").catch(() => {});
const DEFAULT_PAGE_FILTER = "只留 AI 相关";
let settings = { ...ToneOptimizer.DEFAULTS };
let triggerReplies = ZiliTriggerRules.normalizeConfig();
let methodCards = [];
let methodIntakeHistory = [];
let methodIntakeCandidate = null;
let methodEditingId = "";
let engine = {
  provider: "deepseek",
  providerLabel: "DeepSeek",
  model: "",
  modelInfo: null,
  models: [],
  keyConfigured: false,
  providers: []
};
let saveFeedbackTimer;

function normalizeCustomEndpoint(value) {
  try {
    const url = new URL(String(value || "").trim());
    const localHttp = url.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return "";
    if (url.username || url.password) return "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function customOriginPattern(value) {
  const endpoint = normalizeCustomEndpoint(value);
  return endpoint ? `${new URL(endpoint).origin}/*` : "";
}

async function requestCustomHostPermission() {
  const origin = customOriginPattern(form.customApiUrl.value);
  if (!origin) {
    form.keyState.textContent = "请填写 HTTPS 接口地址；本地可用 localhost 或 127.0.0.1";
    return false;
  }
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    form.keyState.textContent = "没有获得这个中转站地址的访问权限";
    return false;
  }
}

function triggerReplyId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function send(message) {
  return ZiliRuntime.send(message);
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs.find(tab => Number.isInteger(tab?.id)) || null;
}

async function notifyActiveTabSettings(nextSettings) {
  const tab = await activeTab();
  if (!tab) return;
  await sendToTab(tab.id, { type: "SETTINGS_UPDATED", settings: nextSettings });
}

function sendToTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        void chrome.runtime.lastError.message;
        resolve({ ok: false, error: "page_unavailable" });
        return;
      }
      resolve(response || { ok: true });
    });
  });
}

function renderCopyMode(response) {
  const active = response?.active === true;
  form.copyMode.setAttribute("aria-pressed", String(active));
  form.copyMode.classList.toggle("is-active", active);
  form.copyModeState.textContent = response?.ok
    ? active ? "已开启：在网页划选文字后，点出现的复制按钮" : "当前网页未开启"
    : "当前页面不可用，请换一个普通网页";
}

function renderVideoTranslation(response) {
  const active = response?.active === true;
  form.videoTranslation.setAttribute("aria-pressed", String(active));
  form.videoTranslation.classList.toggle("is-active", active);
  form.videoTranslationState.classList.toggle("is-error", response?.status === "model_error" || response?.ok === false);
  form.videoTranslationState.textContent = response?.status === "no_video"
    ? "当前网页没有可识别的视频"
    : response?.status === "waiting_captions"
      ? "正在等待英文字幕；请在 YouTube 播放器开启英语字幕"
    : response?.status === "loading_captions"
      ? "正在读取 YouTube 英文字幕…"
    : response?.status === "ready"
      ? "英文字幕已准备好，正在等待下一句"
    : response?.status === "caption_unavailable"
      ? "字幕未读取成功；请关开一次英语字幕，字里会自动重试"
    : response?.status === "model_error"
      ? "字幕翻译失败，请检查模型配置"
      : active
        ? response?.status === "waiting" ? "已开启，正在等待字幕；请确认播放器已打开原字幕" : "正在翻译当前视频字幕"
        : response?.ok ? "当前网页未开启" : "当前页面不可用，请换一个普通网页";
}

async function refreshPageTools() {
  const tab = await activeTab();
  if (!tab) {
    renderCopyMode({ ok: false });
    renderVideoTranslation({ ok: false });
    return;
  }
  const [copy, video] = await Promise.all([
    sendToTab(tab.id, { type: "ZILI_COPY_MODE_STATUS" }),
    sendToTab(tab.id, { type: "ZILI_VIDEO_TRANSLATION_STATUS" })
  ]);
  renderCopyMode(copy);
  renderVideoTranslation(video);
  renderPageClean(await sendToTab(tab.id, { type: "ZILI_PAGE_CLEAN_STATUS" }));
}

async function toggleCopyMode() {
  const tab = await activeTab();
  if (!tab) return renderCopyMode({ ok: false });
  const current = await sendToTab(tab.id, { type: "ZILI_COPY_MODE_STATUS" });
  if (!current?.active && !settings.enabled) {
    form.copyModeState.textContent = "先打开字里总开关";
    return;
  }
  renderCopyMode(await sendToTab(tab.id, { type: "ZILI_COPY_MODE_SET", active: !current?.active }));
}

async function toggleVideoTranslation() {
  const tab = await activeTab();
  if (!tab) return renderVideoTranslation({ ok: false });
  const current = await sendToTab(tab.id, { type: "ZILI_VIDEO_TRANSLATION_STATUS" });
  if (!current?.active) {
    if (!settings.enabled) {
      form.videoTranslationState.textContent = "先打开字里总开关";
      return;
    }
    const engineStatus = await send({ type: "GET_ENGINE_STATUS" });
    if (!engineStatus?.ok) {
      form.videoTranslationState.textContent = "先配置并检查当前模型 API Key";
      return;
    }
  }
  renderVideoTranslation(await sendToTab(tab.id, { type: "ZILI_VIDEO_TRANSLATION_SET", active: !current?.active }));
}

function renderPageClean(response) {
  form.pageFilter.setAttribute("aria-pressed", String(response?.filtered > 0 || response?.watching === true));
}

async function pageCleanRequest(message) {
  const tab = await activeTab();
  if (!tab) return { ok: false, error: "当前页面不可用，请换一个普通网页" };
  const response = await sendToTab(tab.id, message);
  if (response?.error === "page_unavailable") return { ok: false, error: "当前页面不可用，请刷新网页后再试" };
  renderPageClean(await sendToTab(tab.id, { type: "ZILI_PAGE_CLEAN_STATUS" }));
  return response;
}

// One click: filter with the saved instruction (default "只留 AI 相关"); click again to restore.
// 本地收纳：打开设置就问字里桥这台电脑有哪些 Agent、用户允许了哪几个、收纳文件夹在哪。
// 连不上或没授权时只给一个按钮：插件自己不能运行本地程序，也不知道自己被下载到哪，
// 所以复制一段话让用户发给自己电脑上的 AI 助手，由助手找到字里文件夹、代跑安装脚本。
function bridgeSetupPrompt() {
  return [
    "请帮我装好「字里」浏览器插件的本地收纳功能（字里桥）。请你直接在我电脑上操作，不要让我自己开终端：",
    "1. 找到我从 GitHub 下载的字里文件夹：里面同时有 zili-bridge/install.py 和 huashao-tone/manifest.json。先在「文稿」「下载」「桌面」和用户主目录下找，找不到再问我放在哪。",
    "2. 在这个文件夹里运行 python3 zili-bridge/install.py --scan，把它找到的 AI 助手告诉我（这一步只看、不改任何东西）。",
    `3. 再运行 python3 zili-bridge/install.py --allow all --id ${chrome.runtime.id}（--allow all 表示允许找到的所有 AI 助手；我说只要其中几个时，改成 --allow claude,codex 这种写法）。`,
    "4. 用大白话告诉我结果：允许了哪些助手、收纳的东西会存在哪个文件夹。",
    "这个脚本只写几个登记文件和一个后台服务，不安装软件、不联网。除此之外不要改动我电脑上的别的东西。"
  ].join("\n");
}
function matchLocalAgents(manual) {
  const select = form.collectAgent;
  const setup = form.collectSetup;
  const note = setup.querySelector("[data-collect-text]");
  const detail = setup.querySelector("[data-collect-detail]");
  const deploy = setup.querySelector("#collectDeploy");
  const flash = text => {
    if (!manual) return;
    form.saveState.textContent = text;
    setTimeout(() => { if (form.saveState.textContent === text) form.saveState.textContent = ""; }, 4000);
  };
  form.collectMatch.disabled = true;
  select.replaceChildren(new Option("正在查找本地 Agent…"));
  chrome.runtime.sendMessage({ type: "ZILI_COLLECT_DETECT" }, r => {
    const runtimeError = chrome.runtime.lastError?.message || "";
    form.collectMatch.disabled = false;
    setup.querySelector("[data-collect-next]").hidden = true;
    if (!r?.ok || !r.agents.length) {
      const found = r?.found?.length ? `字里桥已经扫描过这台电脑，找到 ${r.found.map(a => a.label).join("、")}，但还没允许字里调用。` : "字里桥已经扫描过这台电脑，没找到能用的 AI 助手（Claude Code、Codex、Gemini CLI、Qwen Code、OpenCode、Hermes）。收纳要靠它们来整理，先装其中一个，再点刷新。";
      select.replaceChildren(new Option(r?.ok ? (r.found?.length ? "还没授权 Agent" : "没找到本地 Agent") : "字里桥没连上"));
      select.disabled = true;
      note.textContent = r?.ok
        ? `${found}点下面的按钮，把那段话发给你的 AI 助手，让它帮你允许。`
        : "还没装字里桥。它负责把网页内容交给你电脑上的 AI 助手（Claude Code、Codex、Hermes 等）。点下面的按钮，把那段话发给你的 AI 助手，它会帮你装好。";
      detail.textContent = r?.ok ? "" : `技术原因：${r?.error || runtimeError || "插件后台没有回应"}`;
      deploy.hidden = Boolean(r?.ok && !r.found?.length);
      setup.hidden = false;
      flash(r?.ok ? "没找到本地 Agent" : "字里桥没连上");
      return;
    }
    select.replaceChildren(...r.agents.map(a => new Option(a.label, a.id, false, a.id === r.selected)));
    select.disabled = false;
    detail.textContent = "";
    deploy.hidden = true;
    setup.hidden = r.folderOk;
    if (!r.folderOk) note.textContent = `收纳文件夹不在了（${r.folder || "还没设置"}）。重新运行一次部署命令选一个文件夹。`;
    flash(`可用：${r.agents.map(a => a.label).join("、")}${r.folderOk ? "" : "，但收纳文件夹不在了"}`);
  });
}

async function deployBridge() {
  try {
    await navigator.clipboard.writeText(bridgeSetupPrompt());
    form.collectSetup.querySelector("[data-collect-next]").hidden = false;
  } catch (_) {
    form.collectSetup.querySelector("[data-collect-detail]").textContent = `复制失败，请手动复制下面这段话：\n${bridgeSetupPrompt()}`;
  }
}

async function togglePageFilter() {
  if (form.pageFilter.getAttribute("aria-pressed") === "true") return restorePage();
  const instruction = form.pageFilterInstruction.value.trim() || DEFAULT_PAGE_FILTER;
  if (!settings.enabled) {
    form.pageCleanState.textContent = "先打开字里总开关";
    return;
  }
  form.pageCleanState.textContent = `正在按“${instruction}”整理这一页…`;
  const response = await pageCleanRequest({ type: "ZILI_PAGE_FILTER_RUN", instruction });
  form.pageCleanState.textContent = response?.ok
    ? `看了 ${response.total} 条，隐藏 ${response.hidden} 条。往下滑新出来的也会自动筛，刷新网页就恢复`
    : response?.error || "脱水失败";
}

async function restorePage() {
  const response = await pageCleanRequest({ type: "ZILI_PAGE_RESTORE" });
  form.pageCleanState.textContent = response?.ok ? "已恢复本页" : response?.error || "恢复失败";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("clipboard_read_failed"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("clipboard_read_failed"));
    }, type, quality);
  });
}

function currentModelCanSeeImages() {
  return engine.modelInfo?.capabilities?.includes("vision") === true;
}

function currentModelLabel() {
  return engine.modelInfo?.label
    || engine.models?.find(item => item.id === engine.model)?.label
    || engine.providerLabel
    || "当前模型";
}

function requireVisionModel() {
  if (!engine.modelInfo || currentModelCanSeeImages()) return true;
  form.screenshotState.className = "screenshot-state is-error";
  form.screenshotState.textContent = "当前模型不能识图，请选择带“可识图”标识的模型";
  return false;
}

async function startScreenshotSelection() {
  if (!requireVisionModel()) return;
  form.captureRegion.disabled = true;
  form.screenshotState.className = "screenshot-state";
  form.screenshotState.textContent = "正在打开网页框选…";
  const tab = await activeTab();
  const response = tab
    ? await sendToTab(tab.id, { type: "START_SCREENSHOT_SELECTION" })
    : { ok: false, error: "page_unavailable" };
  form.captureRegion.disabled = false;
  if (!response?.ok) {
    form.screenshotState.className = "screenshot-state is-error";
    form.screenshotState.textContent = "当前页面不能截图，请换一个普通网页";
    return;
  }
  window.close();
}

function renderPresets() {
  form.presets.replaceChildren();
  for (const [key, preset] of Object.entries(ToneOptimizer.PRESETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset${settings.style === key ? " is-selected" : ""}`;
    button.title = preset.description;
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      settings = ToneOptimizer.applyPreset(key, settings);
      renderPresets();
      renderSliders();
      queueSave();
    });
    form.presets.appendChild(button);
  }
}

function renderSliders() {
  for (const key of ["human", "opinion", "question", "length"]) {
    const input = document.querySelector(`#${key}`);
    const output = document.querySelector(`#${key}-value`);
    input.value = settings[key];
    const renderValue = () => {
      output.textContent = key === "question"
        ? `疑问 ${settings[key]}%`
        : key === "length"
          ? `话痨 ${settings[key]}%`
          : `${settings[key]}%`;
    };
    renderValue();
    input.oninput = () => {
      settings[key] = Number(input.value);
      renderValue();
      queueSave();
    };
  }
}

function renderHighlightControls() {
  const highlightEnabled = ToneOptimizer.highlightEnabled(settings);
  form.selectionOptions.classList.toggle("is-disabled", !highlightEnabled);
  for (const input of [form.termExplanation, form.questionAnswer, form.selectionReply]) {
    input.disabled = !highlightEnabled;
  }
}

function renderTheme() {
  document.documentElement.dataset.theme = settings.theme;
  form.themes?.querySelectorAll("[data-theme]").forEach(button => {
    button.classList.toggle("is-selected", button.dataset.theme === settings.theme);
  });
}

function renderCompanionControl() {
  form.floatingCompanion.disabled = !form.enabled.checked;
}

function renderHomeStatus() {
  if (form.enabledState) {
    form.enabledState.textContent = form.enabled.checked ? "已开启" : "已暂停";
  }
  const writingStatusSummary = form.writingStatusSummary || document.querySelector("#writing-status-summary");
  if (writingStatusSummary) {
    const on = [form.autoRewrite, form.architectMode, form.selectionComments, form.triggerRepliesEnabled]
      .filter(input => input.checked).length;
    writingStatusSummary.textContent = `${on} / 4`;
  }
}

window.addEventListener("zili-home-status-ready", renderHomeStatus);

function renderWritingModeGuide() {
  const automatic = form.autoRewrite.checked;
  form.manualWritingGuide.dataset.mode = automatic ? "automatic" : "manual";
  form.manualWritingGuide.textContent = automatic
    ? "当前：自动润色。打字停顿后会自动处理。"
    : "当前：手动润色。网页输入 4 个字后会出现“润色 / 补充润色”。";
  form.rewriteOptions.classList.toggle("is-disabled", !automatic);
  form.autoApplyRewrite.disabled = !automatic;
}

function renderDisclosureLabel(details) {
  const label = details?.querySelector(":scope > summary em");
  if (label) label.textContent = details.open ? "收起" : "展开";
}

function iconButton(name, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ri");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `assets/remixicon-sprite.svg#ri-${name}`);
  svg.append(use);
  button.append(svg);
  return button;
}

function renderTriggerReplies() {
  form.triggerRepliesEnabled.checked = triggerReplies.enabled;
  form.triggerReplyList.replaceChildren();
  for (const rule of triggerReplies.rules) {
    const row = document.createElement("div");
    row.className = "trigger-reply-row";
    row.dataset.ruleId = rule.id;

    const pair = document.createElement("div");
    pair.className = "trigger-reply-pair";
    const trigger = document.createElement("span");
    trigger.className = "trigger-reply-pattern";
    trigger.textContent = rule.trigger;
    const arrow = document.createElement("span");
    arrow.className = "trigger-reply-arrow";
    arrow.textContent = "→";
    const reply = document.createElement("span");
    reply.className = "trigger-reply-text";
    reply.textContent = rule.reply;
    pair.append(trigger, arrow, reply);

    const actions = document.createElement("div");
    actions.className = "trigger-reply-actions";
    const editButton = iconButton("pencil-line", "编辑");
    editButton.dataset.triggerAction = "edit";
    const deleteButton = iconButton("delete-bin-line", "删除");
    deleteButton.dataset.triggerAction = "delete";
    actions.append(editButton, deleteButton);
    row.append(pair, actions);
    form.triggerReplyList.appendChild(row);
  }
  form.triggerReplyState.hidden = true;
  renderHomeStatus();
}

async function saveTriggerReplies(next = triggerReplies) {
  const normalized = ZiliTriggerRules.normalizeConfig(next);
  const response = await send({
    type: "SAVE_TRIGGER_REPLIES",
    triggerReplies: normalized
  });
  if (!response?.ok) {
    form.triggerReplyState.hidden = false;
    form.triggerReplyState.textContent = "关键词回复没有保存上，请重开插件再试";
    return false;
  }
  triggerReplies = ZiliTriggerRules.normalizeConfig(response.triggerReplies || normalized);
  renderTriggerReplies();
  return true;
}

function closeTriggerReplyDialog() {
  form.triggerReplyDialog.close();
  form.addTriggerReply.focus();
}

function openTriggerReplyDialog(rule = null) {
  form.triggerReplyForm.reset();
  form.triggerReplyId.value = rule?.id || "";
  form.triggerReplyPattern.value = rule?.trigger || "";
  form.triggerReplyText.value = rule?.reply || "";
  form.triggerReplyDialogTitle.textContent = rule ? "编辑关键词回复" : "添加关键词回复";
  form.triggerReplyDialogState.textContent = "";
  form.triggerReplyDialog.showModal();
  requestAnimationFrame(() => form.triggerReplyPattern.focus());
}

async function submitTriggerReply(event) {
  event.preventDefault();
  const normalized = ZiliTriggerRules.normalizeRule({
    id: form.triggerReplyId.value || triggerReplyId(),
    trigger: form.triggerReplyPattern.value,
    reply: form.triggerReplyText.value
  });
  if (!normalized) {
    form.triggerReplyDialogState.textContent = "左边触发内容和右边回复都要填写";
    return;
  }
  const existingIndex = triggerReplies.rules.findIndex(rule => rule.id === normalized.id);
  const rules = [...triggerReplies.rules];
  if (existingIndex >= 0) rules.splice(existingIndex, 1, normalized);
  else rules.push(normalized);
  const saved = await saveTriggerReplies({ ...triggerReplies, rules });
  if (saved) closeTriggerReplyDialog();
}

async function handleTriggerReplyListClick(event) {
  const button = event.target.closest("[data-trigger-action]");
  const row = button?.closest("[data-rule-id]");
  if (!button || !row) return;
  const rule = triggerReplies.rules.find(item => item.id === row.dataset.ruleId);
  if (!rule) return;
  if (button.dataset.triggerAction === "edit") {
    openTriggerReplyDialog(rule);
    return;
  }
  if (button.dataset.triggerAction === "delete") {
    await saveTriggerReplies({
      ...triggerReplies,
      rules: triggerReplies.rules.filter(item => item.id !== rule.id)
    });
  }
}

async function notifyActiveTabMethodCards(cards) {
  const tab = await activeTab();
  if (!tab) return;
  await sendToTab(tab.id, { type: "METHOD_CARDS_UPDATED", methodCards: cards });
}

function renderMethodCards() {
  const builtins = ZiliMethodLibrary.BUILTINS;
  const allCards = ZiliMethodLibrary.methods(methodCards);
  form.methodCardCount.textContent = String(builtins.length + methodCards.length);
  form.methodCardList.replaceChildren();

  for (const method of allCards) {
    const row = document.createElement("div");
    row.className = "method-card-row";
    row.dataset.methodId = method.id;

    const copy = document.createElement("div");
    copy.className = "method-card-copy";
    const name = document.createElement("strong");
    name.textContent = method.name;
    const summary = document.createElement("small");
    summary.textContent = method.summary;
    copy.title = "点开看完整提示词";
    copy.tabIndex = 0;
    copy.setAttribute("role", "button");
    copy.setAttribute("aria-expanded", "false");
    copy.append(name, summary);

    // 点开看这张卡实际会发出去的提示词；{draft}/{concept} 是写进去时才替换的占位。
    const prompt = document.createElement("pre");
    prompt.className = "method-card-prompt";
    prompt.hidden = true;
    prompt.textContent = method.prompt
      .replaceAll("{draft}", "【你写的那句话】")
      .replaceAll("{concept}", "【你要问的概念】");

    const actions = document.createElement("div");
    actions.className = "method-card-actions";
    if (!method.builtin) {
      const editButton = iconButton("pencil-line", "编辑");
      editButton.dataset.methodAction = "edit";
      const deleteButton = iconButton("delete-bin-line", "删除");
      deleteButton.dataset.methodAction = "delete";
      actions.append(editButton, deleteButton);
    }
    row.append(copy, actions, prompt);
    form.methodCardList.appendChild(row);
  }
  form.methodCardState.textContent = "";
}

async function saveMethodCards(next = methodCards) {
  const normalized = ZiliMethodLibrary.normalizeCustomCards(next);
  const response = await send({ type: "SAVE_METHOD_CARDS", methodCards: normalized });
  if (!response?.ok) {
    form.methodCardState.textContent = "方法论没有保存上，请重开插件再试";
    return false;
  }
  methodCards = ZiliMethodLibrary.normalizeCustomCards(response.methodCards || normalized);
  renderMethodCards();
  void refreshPageTools();
  await notifyActiveTabMethodCards(methodCards);
  return true;
}

function closeMethodCardDialog() {
  methodIntakeHistory = [];
  methodIntakeCandidate = null;
  methodEditingId = "";
  form.methodCardDialog.close();
  form.addMethodCard.focus();
}

function openMethodCardDialog(method = null) {
  form.methodCardForm.reset();
  methodIntakeHistory = [];
  methodIntakeCandidate = null;
  methodEditingId = method?.id || "";
  form.methodCardDialogTitle.textContent = method ? `让 AI 调整「${method.name}」` : "让 AI 帮我录入方法";
  form.methodCardInput.placeholder = method
    ? "直接说想怎么调整；例如“保留原意，但补上新手会说的触发词”"
    : "直接说需求，或粘贴现有 Prompt / Skill；不必填写字段";
  form.methodCardDialogState.textContent = "";
  form.methodCardPreview.hidden = true;
  form.saveMethodCard.hidden = true;
  form.methodCardAsk.hidden = false;
  form.methodCardAsk.disabled = false;
  form.methodCardDialog.showModal();
  requestAnimationFrame(() => form.methodCardInput.focus());
}

function methodIntakeErrorLabel(error) {
  const reason = String(error || "");
  if (/method_intake_empty/.test(reason)) return "先说说你的需求，或粘贴一段现有材料";
  if (/model_key_missing|model_configuration_missing/.test(reason)) return "请先在“大模型接口”配置并检查当前 API";
  if (/method_intake_invalid_response/.test(reason)) return "AI 没有按方法卡格式整理成功，请再试一次";
  if (/engine_timeout/.test(reason)) return "当前模型响应超时，请再试一次";
  if (/auth|key_missing/.test(reason)) return "当前 API Key 不可用，请在“大模型接口”检查";
  if (/quota|balance/.test(reason)) return "当前模型额度不足";
  return "这次没有整理成功，请稍后再试";
}

function methodUsageLabel(usage) {
  const total = Number(usage?.totalTokens ?? usage?.total_tokens);
  return Number.isFinite(total) && total > 0 ? ` · 本次 ${total} Token` : "";
}

function renderMethodIntakeCandidate(candidate) {
  form.methodCardPreview.hidden = !candidate;
  if (!candidate) return;
  form.methodCardPreviewName.textContent = candidate.name;
  form.methodCardPreviewMeta.textContent = [
    candidate.category,
    ...candidate.expert.slice(0, 3),
    ...candidate.beginner.slice(0, 3)
  ].filter(Boolean).join(" · ");
  form.methodCardPreviewSummary.textContent = candidate.summary;
  form.methodCardPreviewPrompt.textContent = candidate.prompt;
}

async function submitMethodCard(event) {
  event.preventDefault();
  const text = String(form.methodCardInput.value || "").trim();
  if (!text) {
    form.methodCardDialogState.textContent = "先说说你的需求，或粘贴一段现有材料";
    return;
  }
  const existingCard = methodIntakeCandidate
    || methodCards.find(item => item.id === methodEditingId)
    || null;
  methodIntakeHistory.push({ role: "user", content: text });
  form.methodCardAsk.disabled = true;
  form.methodCardDialogState.textContent = "正在用当前 API 整理…";
  const response = await send({
    type: "ZILI_METHOD_INTAKE",
    text,
    history: methodIntakeHistory.slice(0, -1),
    existingCard
  });
  form.methodCardAsk.disabled = false;
  if (!response?.ok) {
    methodIntakeHistory.pop();
    form.methodCardDialogState.textContent = methodIntakeErrorLabel(response?.error);
    return;
  }
  form.methodCardInput.value = "";
  if (response.kind === "question") {
    methodIntakeHistory.push({ role: "assistant", content: response.question });
    methodIntakeCandidate = null;
    renderMethodIntakeCandidate(null);
    form.saveMethodCard.hidden = true;
    form.methodCardAsk.textContent = "继续补充";
    form.methodCardDialogState.textContent = `还缺一项：${response.question}${methodUsageLabel(response.usage)}`;
    form.methodCardInput.focus();
    return;
  }
  if (response.kind !== "candidate") {
    form.methodCardDialogState.textContent = "AI 没有整理出可保存的方法，请补充一点背景后再试";
    return;
  }
  methodIntakeCandidate = response.card;
  renderMethodIntakeCandidate(methodIntakeCandidate);
  form.methodCardAsk.textContent = "换个说法再整理";
  form.saveMethodCard.hidden = false;
  form.methodCardDialogState.textContent = `已整理好，确认后才保存到本机${methodUsageLabel(response.usage)}`;
}

async function saveGeneratedMethodCard() {
  if (!methodIntakeCandidate) return;
  const normalized = ZiliMethodLibrary.normalizeCustomCard({
    ...methodIntakeCandidate,
    id: methodEditingId || methodIntakeCandidate.id
  });
  if (!normalized) return;
  const existingIndex = methodCards.findIndex(item => item.id === normalized.id);
  const next = [...methodCards];
  if (existingIndex >= 0) next.splice(existingIndex, 1, normalized);
  else next.push(normalized);
  const saved = await saveMethodCards(next);
  if (saved) closeMethodCardDialog();
}

function toggleMethodCardPrompt(copy) {
  const prompt = copy.closest("[data-method-id]")?.querySelector(".method-card-prompt");
  if (!prompt) return;
  prompt.hidden = !prompt.hidden;
  copy.setAttribute("aria-expanded", String(!prompt.hidden));
}

async function handleMethodCardListClick(event) {
  const copy = event.target.closest(".method-card-copy");
  if (copy) {
    toggleMethodCardPrompt(copy);
    return;
  }
  const button = event.target.closest("[data-method-action]");
  const row = button?.closest("[data-method-id]");
  if (!button || !row) return;
  const method = methodCards.find(item => item.id === row.dataset.methodId);
  if (!method) return;
  if (button.dataset.methodAction === "edit") {
    openMethodCardDialog(method);
    return;
  }
  if (button.dataset.methodAction === "delete") {
    await saveMethodCards(methodCards.filter(item => item.id !== method.id));
  }
}

function collectVoiceProfileInput() {
  return {
    scene: form.voiceScene.value,
    tone: form.voiceTone.value,
    disagreement: form.voiceDisagreement.value,
    agree: form.voiceAgree.value,
    strongAgree: form.voiceStrongAgree.value,
    doubt: form.voiceDoubt.value,
    surprise: form.voiceSurprise.value,
    avoid: form.voiceAvoid.value,
    signature: form.voiceSignature.value,
    samples: form.voiceSamples.value
  };
}

async function copyPlainText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

async function copyVoiceTemplate() {
  const copied = await copyPlainText(ZiliVoiceProfile.blankTemplate());
  form.voiceBuilderState.textContent = copied ? "填写模板已复制" : "复制失败，请直接在这里填写";
}

async function buildVoiceProfile() {
  const input = collectVoiceProfileInput();
  if (!ZiliVoiceProfile.hasPersonalData(input)) {
    form.voiceBuilderState.textContent = "先填一项你真实会说的话，或者放一条真实样例";
    return;
  }
  const profile = ZiliVoiceProfile.buildProfile(input);
  form.reference.value = ZiliVoiceProfile.mergeProfile(form.reference.value, profile);
  settings = collect();
  form.voiceBuilderState.textContent = "已经整理成个人表达档案，正在保存…";
  await save();
  form.voiceBuilderState.textContent = "已填入“我的本地口吻”，原来的样例也保留了";
}

function render() {
  form.enabled.checked = settings.enabled;
  form.autoRewrite.checked = settings.autoRewrite;
  form.architectMode.checked = settings.architectMode;
  form.autoApplyRewrite.checked = settings.autoApplyRewrite;
  form.selectionComments.checked = settings.selectionComments;
  form.termExplanation.checked = settings.termExplanation;
  form.questionAnswer.checked = settings.questionAnswer;
  form.selectionReply.checked = settings.selectionReply;
  form.floatingCompanion.checked = settings.floatingCompanion;
  renderHomeStatus();
  renderCompanionControl();
  renderWritingModeGuide();
  renderHighlightControls();
  form.reference.value = settings.reference;
  renderTheme();
  renderPresets();
  renderSliders();
}

function collect() {
  return ToneOptimizer.normalizeSettings({
    ...settings,
    enabled: form.enabled.checked,
    autoRewrite: form.autoRewrite.checked,
    architectMode: form.architectMode.checked,
    autoApplyRewrite: form.autoApplyRewrite.checked,
    selectionComments: form.selectionComments.checked,
    termExplanation: form.termExplanation.checked,
    questionAnswer: form.questionAnswer.checked,
    selectionReply: form.selectionReply.checked,
    floatingCompanion: form.floatingCompanion.checked,
    reference: form.reference.value
  });
}

const POPUP_SETTING_KEYS = [
  "enabled",
  "autoRewrite",
  "architectMode",
  "autoApplyRewrite",
  "selectionComments",
  "termExplanation",
  "questionAnswer",
  "selectionReply",
  "floatingCompanion",
  "theme",
  "style",
  "human",
  "opinion",
  "question",
  "length",
  // The profile editor has its own explicit save action.
];

function pickSettings(source = {}, keys = []) {
  const picked = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) picked[key] = source[key];
  }
  return picked;
}

async function readLatestSettings() {
  const response = await send({ type: "GET_SETTINGS" });
  return response?.ok
    ? ToneOptimizer.normalizeSettings(response.settings)
    : null;
}

async function saveSettingsPatch(patch = {}, keys = Object.keys(patch), meta = {}) {
  const picked = pickSettings(patch, keys);
  const response = await send({ type: "SAVE_SETTINGS", patch: picked });
  const next = response?.settings;
  if (response?.ok) {
    settings = ToneOptimizer.normalizeSettings(response.settings || next);
    render();
    await notifyActiveTabSettings(settings);
    globalThis.ZiliSettingsAssistant?.notifySettingsSaved?.(settings, meta);
  }
  return response;
}

function referenceStatusLabel(prefix) {
  const sampleLength = String(settings.reference || "").trim().length;
  return sampleLength
    ? `${prefix} · 本地口吻 ${sampleLength} 字已启用`
    : prefix;
}

let saveTimer;
function queueSave() {
  globalThis.ZiliSettingsAssistant?.notifySettingsChanged?.();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

async function save() {
  clearTimeout(saveTimer);
  clearTimeout(saveFeedbackTimer);
  form.saveButton.disabled = true;
  form.saveButton.textContent = "保存中…";
  form.saveState.textContent = "保存中…";
  settings = collect();
  const response = await saveSettingsPatch(settings, POPUP_SETTING_KEYS, { source: "popup" });
  if (response?.ok) {
    form.saveState.textContent = referenceStatusLabel("设置已保存");
    form.saveButton.textContent = "已保存";
    saveFeedbackTimer = setTimeout(() => {
      form.saveButton.textContent = "保存设置";
      form.saveState.textContent = "";
    }, 2200);
  } else {
    form.saveState.textContent = response?.error === "message_port_closed"
      ? "保存失败，请重开插件"
      : "设置保存失败";
    form.saveButton.textContent = "重试保存";
  }
  form.saveButton.disabled = false;
}

function connectionErrorLabel(response) {
  const error = response?.error || response?.status || "";
  if (/message_port_closed|runtime_unavailable|empty_response/i.test(error)) return "检查失败，请重开插件";
  if (/key_missing/i.test(error)) return "请先保存 API Key";
  if (/custom_endpoint/i.test(error)) return "请检查中转站 API 地址";
  if (/custom_model/i.test(error)) return "请填写中转站的模型 ID";
  if (/permission/i.test(error)) return "请允许字里访问这个中转站地址";
  if (/auth/i.test(error)) return "API Key 无效";
  if (/balance/i.test(error)) return "账户余额不足";
  if (/rate_limited/i.test(error)) return "请求太频繁，请稍后重试";
  if (/timeout/i.test(error)) return "连接超时，请重试";
  return `${engine.providerLabel || "模型"}连接失败`;
}

function selectedProviderLabel() {
  return form.modelProvider.selectedOptions?.[0]?.textContent || engine.providerLabel || "当前模型";
}

function formatPrice(modelInfo) {
  const pricing = modelInfo?.pricing || {};
  if (Number.isFinite(pricing.inputPerMillion) && Number.isFinite(pricing.outputPerMillion)) {
    const symbol = pricing.currency === "USD" ? "$" : "¥";
    return `输入 ${symbol}${pricing.inputPerMillion}/百万 Token · 输出 ${symbol}${pricing.outputPerMillion}/百万 Token`;
  }
  return pricing.note || "费用以服务商官网实时价格为准";
}

function capabilityLabels(capabilities = []) {
  const labels = {
    fast: "快速",
    chat: "日常",
    reasoning: "推理",
    webSearch: "联网",
    vision: "可识图"
  };
  return capabilities.map(item => labels[item]).filter(Boolean).join(" · ");
}

function renderModelOptions() {
  const models = Array.isArray(engine.models) ? engine.models : [];
  const custom = engine.provider === "custom";
  form.modelVersion.hidden = custom;
  form.modelVersionLabel.hidden = custom;
  form.customProviderFields.hidden = !custom;
  form.modelVersion.replaceChildren();
  for (const item of models) {
    const option = document.createElement("option");
    const badges = [
      item.recommended ? "推荐" : "",
      item.capabilities?.includes("vision") ? "可识图" : ""
    ].filter(Boolean);
    option.value = item.id;
    option.textContent = `${item.label}${badges.length ? `（${badges.join(" · ")}）` : ""}`;
    form.modelVersion.appendChild(option);
  }
  if (engine.model) form.modelVersion.value = engine.model;
  form.modelVersion.disabled = models.length < 2;
  if (custom) {
    const customConfig = engine.customConfig || {};
    if (document.activeElement !== form.customApiUrl) {
      form.customApiUrl.value = customConfig.apiUrl || "";
    }
    if (document.activeElement !== form.customModelId) {
      form.customModelId.value = customConfig.model || engine.model || "";
    }
    form.customVision.checked = customConfig.capabilities?.vision === true;
    form.customWebSearch.checked = customConfig.capabilities?.webSearch === true;
    form.customModelList.replaceChildren();
    for (const modelId of customConfig.discoveredModels || []) {
      const option = document.createElement("option");
      option.value = modelId;
      form.customModelList.appendChild(option);
    }
  }
}

function renderModelDetails() {
  const modelInfo = engine.modelInfo
    || engine.models?.find(item => item.id === engine.model)
    || null;
  const tags = capabilityLabels(modelInfo?.capabilities);
  form.providerModel.textContent = modelInfo
    ? `${modelInfo.id}${modelInfo.recommended ? " · 推荐" : ""}${tags ? ` · ${tags}` : ""}`
    : (engine.model || "");
  form.modelUseCase.textContent = modelInfo
    ? `${modelInfo.useCase}${engine.providerRecommendation ? ` · ${engine.providerRecommendation}` : ""}`
    : "";
  form.modelPrice.textContent = modelInfo
    ? engine.provider === "custom"
      ? "价格由中转站和你填写的模型决定，字里只显示 API 返回的 Token 用量"
      : `${formatPrice(modelInfo)}${modelInfo.pricing?.note ? ` · ${modelInfo.pricing.note}` : ""}`
    : "";
  form.modelId.textContent = modelInfo
    ? engine.provider === "custom"
      ? `模型 ID：${modelInfo.id || "待填写"}`
      : `模型 ID：${modelInfo.id} · 价格更新 ${modelInfo.pricing?.updatedAt || "待确认"}`
    : "";
}

function renderEngine(response = {}) {
  engine = { ...engine, ...response };
  if (engine.provider) form.modelProvider.value = engine.provider;
  engine.providerLabel = response.providerLabel || selectedProviderLabel();
  form.providerKeyLabel.textContent = `${engine.providerLabel} API Key`;
  renderModelOptions();
  renderModelDetails();
  form.providerApiKey.placeholder = engine.keyConfigured
    ? "已保存；输入新密钥可替换"
    : "粘贴当前服务的 API Key";
  if (form.screenshotModelState) {
    form.screenshotModelState.textContent = currentModelCanSeeImages()
      ? `${currentModelLabel()} · 可识图`
      : "当前模型不可识图";
  }
}

async function selectModelProvider() {
  form.modelProvider.disabled = true;
  form.connectionState.textContent = "正在切换…";
  const response = await send({
    type: "SELECT_MODEL_PROVIDER",
    provider: form.modelProvider.value
  });
  if (response?.provider) {
    renderEngine(response);
    form.connectionState.textContent = response.keyConfigured ? "密钥已保存，待检查" : "等待填写密钥";
    form.connectionState.className = "connection-state";
    form.keyState.textContent = response.keyConfigured
      ? `${engine.providerLabel} 密钥已保存在这台 Chrome`
      : `${engine.providerLabel} 还没有保存密钥`;
    form.checkConnection.textContent = response.keyConfigured ? "检查 API 是否可用" : "保存 Key 后检查";
  } else {
    form.connectionState.textContent = "切换失败";
    form.connectionState.className = "connection-state is-offline";
  }
  form.modelProvider.disabled = false;
}

async function selectModelVersion() {
  form.modelVersion.disabled = true;
  form.connectionState.textContent = "正在切换模型…";
  const response = await send({
    type: "SELECT_PROVIDER_MODEL",
    provider: form.modelProvider.value,
    model: form.modelVersion.value
  });
  if (response?.provider) {
    renderEngine(response);
    form.connectionState.textContent = response.keyConfigured ? "模型已切换，待检查" : "模型已切换，等待填写密钥";
    form.connectionState.className = "connection-state";
  } else {
    form.connectionState.textContent = "模型切换失败";
    form.connectionState.className = "connection-state is-offline";
  }
  form.modelVersion.disabled = (engine.models?.length || 0) < 2;
}

async function checkConnection(verifyApi = false) {
  if (verifyApi && form.modelProvider.value === "custom") {
    const permitted = await requestCustomHostPermission();
    if (!permitted) return { ok: false, error: "custom_permission_denied" };
  }
  form.checkConnection.disabled = true;
  form.checkConnection.textContent = verifyApi ? "正在检查 API…" : "正在读取状态…";
  form.connectionState.textContent = verifyApi ? `正在连接 ${selectedProviderLabel()}…` : "读取中";
  form.connectionState.className = "connection-state";
  const response = await send({
    type: verifyApi ? "TEST_MODEL_CONNECTION" : "GET_ENGINE_STATUS"
  });
  if (response?.provider) renderEngine(response);
  if (verifyApi) {
    const connected = Boolean(response?.ok && response.status === "connected");
    form.connectionState.textContent = connected
      ? `已连接 ${engine.providerLabel}${response.latencyMs ? ` · ${response.latencyMs}ms` : ""}`
      : connectionErrorLabel(response);
    form.connectionState.className = `connection-state ${connected ? "is-ready" : "is-offline"}`;
    form.keyState.textContent = connected
      ? "密钥已保存，API 可以正常使用"
      : (response?.keyConfigured ? "密钥已保存，但 API 检查失败" : "还没有保存密钥");
    form.checkConnection.disabled = false;
    form.checkConnection.textContent = "再次检查 API";
    return response;
  }

  // 只显示上一次请求失败的原因，方便判断是密钥、余额还是网络问题。
  const ENGINE_ERROR_HINTS = {
    model_auth_error: "密钥无效",
    model_balance_insufficient: "余额不足",
    model_rate_limited: "请求太频繁",
    model_invalid_response: "返回格式不对",
    model_not_found: "模型名不对",
    model_request_invalid: "请求被模型拒绝，换个模型试试",
    model_server_error: "对方服务器出错，稍后再试",
    model_network_error: "连不上，检查网络或代理",
    engine_timeout: "等太久没回应",
    model_unavailable: "服务暂时不可用",
    fresh_output_repeated: "换一版没换出来"
  };
  const directReady = Boolean(response?.ok && response.status === "ready");
  const lastStatus = response?.engine?.lastStatus;
  const label = response?.error === "message_port_closed"
    ? "请重开弹窗"
    : !directReady
    ? (response?.status === "model_key_missing" ? "等待填写密钥" : "连接不可用")
    : lastStatus === "success"
      ? "上次连接成功"
    : lastStatus === "timeout"
      ? `${engine.providerLabel} 超时`
      : lastStatus === "error"
      ? `${engine.providerLabel} 异常${ENGINE_ERROR_HINTS[response?.engine?.lastError] ? `：${ENGINE_ERROR_HINTS[response.engine.lastError]}` : ""}`
          : "密钥已保存，待检查";
  const ready = directReady && lastStatus === "success";
  form.connectionState.textContent = label;
  const statusClass = ready
    ? "is-ready"
    : ["timeout", "error"].includes(lastStatus)
      ? "is-offline"
      : "";
  form.connectionState.className = `connection-state ${statusClass}`.trim();
  form.keyState.textContent = response?.keyConfigured ? "密钥已保存在这台 Chrome" : "只保存在这台 Chrome";
  form.checkConnection.disabled = false;
  form.checkConnection.textContent = response?.keyConfigured ? "检查 API 是否可用" : "保存 Key 后检查";
  return response;
}

async function saveProviderKey() {
  const key = form.providerApiKey.value.trim();
  if (!key) {
    form.keyState.textContent = "请先粘贴密钥";
    return;
  }
  form.keyState.textContent = "保存中…";
  const custom = form.modelProvider.value === "custom";
  if (custom) {
    const permitted = await requestCustomHostPermission();
    if (!permitted) return;
  }
  const response = await send(custom
    ? {
        type: "SAVE_CUSTOM_PROVIDER",
        apiUrl: form.customApiUrl.value,
        model: form.customModelId.value,
        capabilities: {
          vision: form.customVision.checked,
          webSearch: form.customWebSearch.checked
        },
        discoveredModels: engine.customConfig?.discoveredModels || [],
        key
      }
    : {
        type: "SAVE_PROVIDER_KEY",
        provider: form.modelProvider.value,
        key
      });
  form.providerApiKey.value = "";
  if (response?.provider) renderEngine(response);
  form.keyState.textContent = response?.ok
    ? "配置已保存，正在检查 API…"
    : connectionErrorLabel(response);
  if (response?.ok) await checkConnection(true);
  else await checkConnection(false);
}

async function fetchCustomModels() {
  const permitted = await requestCustomHostPermission();
  if (!permitted) return;
  form.fetchCustomModels.disabled = true;
  form.fetchCustomModels.textContent = "读取中…";
  form.keyState.textContent = "正在读取中转站模型列表…";
  const response = await send({
    type: "FETCH_CUSTOM_MODELS",
    apiUrl: form.customApiUrl.value,
    key: form.providerApiKey.value.trim()
  });
  form.fetchCustomModels.disabled = false;
  form.fetchCustomModels.textContent = "读取模型";
  if (!response?.ok) {
    form.keyState.textContent = response?.error === "custom_models_empty"
      ? "接口没有返回模型列表，请手动填写模型 ID"
      : connectionErrorLabel(response);
    return;
  }
  form.customModelList.replaceChildren();
  for (const modelId of response.models || []) {
    const option = document.createElement("option");
    option.value = modelId;
    form.customModelList.appendChild(option);
  }
  if (!form.customModelId.value && response.models?.[0]) {
    form.customModelId.value = response.models[0];
  }
  engine.customConfig = {
    ...(engine.customConfig || {}),
    discoveredModels: [...(response.models || [])]
  };
  form.keyState.textContent = `读到 ${response.models.length} 个模型，选择后点保存`;
}

async function clearProviderKey() {
  const response = await send({
    type: "CLEAR_PROVIDER_KEY",
    provider: form.modelProvider.value
  });
  form.providerApiKey.value = "";
  form.keyState.textContent = response?.ok ? "密钥已清除" : "清除失败";
  await checkConnection(false);
}

async function init() {
  const [response, triggerResponse, methodResponse] = await Promise.all([
    send({ type: "GET_SETTINGS" }),
    send({ type: "GET_TRIGGER_REPLIES" }),
    send({ type: "GET_METHOD_CARDS" })
  ]);
  if (response?.ok) settings = ToneOptimizer.normalizeSettings(response.settings);
  if (triggerResponse?.ok) {
    triggerReplies = ZiliTriggerRules.normalizeConfig(triggerResponse.triggerReplies);
  }
  if (methodResponse?.ok) {
    methodCards = ZiliMethodLibrary.normalizeCustomCards(methodResponse.methodCards);
  }
  render();
  renderTriggerReplies();
  renderMethodCards();
  form.saveState.textContent = "";
  form.enabled.addEventListener("change", () => {
    settings = collect();
    renderHomeStatus();
    renderHighlightControls();
    renderCompanionControl();
    void save();
  });
  form.autoRewrite.addEventListener("change", () => {
    settings = collect();
    renderHomeStatus();
    renderWritingModeGuide();
    queueSave();
  });
  form.architectMode.addEventListener("change", () => {
    settings = collect();
    renderHomeStatus();
    void save();
  });
  form.autoApplyRewrite.addEventListener("change", queueSave);
  form.selectionComments.addEventListener("change", () => {
    settings = collect();
    renderHomeStatus();
    renderHighlightControls();
    void save();
  });
  form.termExplanation.addEventListener("change", queueSave);
  form.questionAnswer.addEventListener("change", queueSave);
  form.selectionReply.addEventListener("change", queueSave);
  form.floatingCompanion.addEventListener("change", () => void save());
  // Editing a sample must not silently replace the saved profile on blur.
  form.voiceBuilder?.addEventListener("toggle", () => {
    const label = form.voiceBuilder.querySelector("summary em");
    if (label) label.textContent = form.voiceBuilder.open ? "收起" : "展开";
  });
  for (const details of [form.toneSettings, form.methodLibraryDetails, form.engineSettings]) {
    details?.addEventListener("toggle", () => renderDisclosureLabel(details));
    renderDisclosureLabel(details);
  }
  form.copyVoiceTemplate?.addEventListener("click", copyVoiceTemplate);
  form.buildVoiceProfile?.addEventListener("click", buildVoiceProfile);
  form.triggerRepliesEnabled.addEventListener("change", () => {
    void saveTriggerReplies({ ...triggerReplies, enabled: form.triggerRepliesEnabled.checked });
    renderHomeStatus();
  });
  form.addTriggerReply.addEventListener("click", () => openTriggerReplyDialog());
  form.triggerReplyList.addEventListener("click", handleTriggerReplyListClick);
  form.triggerReplyForm.addEventListener("submit", submitTriggerReply);
  form.cancelTriggerReply.addEventListener("click", closeTriggerReplyDialog);
  form.cancelTriggerReplyTop.addEventListener("click", closeTriggerReplyDialog);
  form.triggerReplyDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeTriggerReplyDialog();
  });
  form.addMethodCard.addEventListener("click", () => openMethodCardDialog());
  form.methodCardList.addEventListener("click", handleMethodCardListClick);
  form.methodCardList.addEventListener("keydown", event => {
    const copy = event.target.closest(".method-card-copy");
    if (!copy || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleMethodCardPrompt(copy);
  });
  form.methodCardForm.addEventListener("submit", submitMethodCard);
  form.saveMethodCard.addEventListener("click", () => void saveGeneratedMethodCard());
  form.cancelMethodCard.addEventListener("click", closeMethodCardDialog);
  form.cancelMethodCardTop.addEventListener("click", closeMethodCardDialog);
  form.methodCardDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeMethodCardDialog();
  });
  form.themes?.addEventListener("click", event => {
    const button = event.target.closest("[data-theme]");
    if (!button) return;
    settings = ToneOptimizer.normalizeSettings({ ...settings, theme: button.dataset.theme });
    renderTheme();
    queueSave();
  });
  form.saveButton.addEventListener("click", save);
  form.captureRegion.addEventListener("click", startScreenshotSelection);
  form.copyMode.addEventListener("click", toggleCopyMode);
  form.videoTranslation.addEventListener("click", toggleVideoTranslation);
  form.pageFilter.addEventListener("click", () => void togglePageFilter());
  form.pageFilterInstruction.addEventListener("change", () => {
    void chrome.storage.local.set({ [PAGE_FILTER_KEY]: form.pageFilterInstruction.value.trim() });
  });
  form.openSettings.addEventListener("click", () => {
    const open = form.settingsPanel.hidden;
    form.settingsPanel.hidden = !open;
    form.openSettings.setAttribute("aria-expanded", String(open));
  });
  // 本地收纳：列出用户允许过的本地 Agent。
  form.collectAgent.addEventListener("change", () => {
    void chrome.storage.local.set({ ziliCollectAgent: form.collectAgent.value });
  });
  form.collectMatch.addEventListener("click", () => matchLocalAgents(true));
  form.collectSetup.querySelector("#collectDeploy").addEventListener("click", deployBridge);
  matchLocalAgents(false);
  chrome.storage.local.get(PAGE_FILTER_KEY).then(data => {
    if (data?.[PAGE_FILTER_KEY]) form.pageFilterInstruction.value = data[PAGE_FILTER_KEY];
  }).catch(() => {});
  form.checkConnection.addEventListener("click", () => checkConnection(true));
  form.modelProvider.addEventListener("change", selectModelProvider);
  form.modelVersion.addEventListener("change", selectModelVersion);
  form.fetchCustomModels.addEventListener("click", fetchCustomModels);
  form.saveProviderKey.addEventListener("click", saveProviderKey);
  form.clearProviderKey.addEventListener("click", clearProviderKey);
  form.providerApiKey.addEventListener("keydown", event => {
    if (event.key === "Enter") saveProviderKey();
  });
  checkConnection(false);
  await globalThis.ZiliSettingsAssistant?.init?.({
    getSettings: readLatestSettings,
    saveSettings: (patch, meta) => saveSettingsPatch(patch, Object.keys(patch), meta),
    getEngineStatus: () => send({ type: "GET_ENGINE_STATUS" }),
    openSettings: () => {
      form.settingsPanel.hidden = false;
      form.openSettings.setAttribute("aria-expanded", "true");
      form.toneSettings.open = true;
      renderDisclosureLabel(form.toneSettings);
      form.toneSettings.scrollIntoView({ block: "nearest" });
    }
  });
}

init();
