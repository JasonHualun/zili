(() => {
  const get = (selector) => document.querySelector(selector);
  const libraryButton = get("#openEnglishLibrary");
  const engine = get("#engine-settings");

  // Tool tiles share one status line: show only the message belonging to the tile last pressed.
  const toolStatus = {
    captureRegion: "#screenshot-state",
    copyMode: "#copyModeState",
    videoTranslation: "#videoTranslationState",
    pageFilter: "#pageCleanState"
  };
  const statusLines = [...document.querySelectorAll(".tool-status [role=status]")];
  statusLines.forEach((line) => { line.hidden = true; });
  get(".tool-grid").addEventListener("click", (event) => {
    const tile = event.target.closest("button");
    const target = tile && get(toolStatus[tile.id]);
    statusLines.forEach((line) => { line.hidden = line !== target; });
  });

  get("#voiceTutor").onclick = () => {
    ZiliRuntime.send({ type: "ZILI_VOICE_TUTOR_OPEN" }, { timeoutMs: 10000 }).then(() => window.close()).catch(() => {});
  };

  const dialog = document.createElement("dialog");
  dialog.className = "sheet english-library";
  dialog.innerHTML = '<div class="dialog-head"><h2>英语收藏</h2><button type="button" class="icon-button" data-close aria-label="关闭"><svg class="ri" aria-hidden="true"><use href="assets/remixicon-sprite.svg#ri-close-line"/></svg></button></div><p data-state class="inline-state" role="status"></p><div data-items></div>';
  document.body.append(dialog);
  const status = (text) => { dialog.querySelector("[data-state]").textContent = text; };
  async function send(message) {
    const response = await ZiliRuntime.send(message, { timeoutMs: 10000 });
    if (!response?.ok) throw Error(response?.error || "读取失败");
    return response;
  }
  // 朗读：所有收藏共用一个播放器，点另一条会先停掉正在读的那条；只读单词和英文例句。
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  let speakingId = null, speakingButton = null, parts = [];
  const voice = globalThis.ZiliEnglishVoice?.attach(null, () => parts, status);
  globalThis.speechSynthesis?.getVoices();
  const showSpeaking = (button, playing) => {
    if (!button) return;
    button.innerHTML = playing ? STOP : SPEAKER;
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-label", playing ? "停止朗读" : "朗读单词和例句");
  };
  voice?.setState(playing => {
    if (!playing) speakingId = null;
    showSpeaking(speakingButton, playing);
  });
  function speak(note, example, button) {
    if (speakingId === note.id) return voice.stop();
    voice.stop();
    showSpeaking(speakingButton, false);
    parts = [note.context, example];
    speakingId = note.id; speakingButton = button;
    void voice.toggle();
  }
  // 收藏正文是一段拼好的文字：首行释义，中间“词性：…”这类小节，末尾英文例句和译文。拆开后分块显示。
  const CJK = /[\u3400-\u9fff]/;
  function parseNote(note) {
    const lines = String(note.text || "").split("\n").map(line => line.trim()).filter(Boolean);
    const meaning = lines.shift() || "";
    let lastLabel = -1;
    lines.forEach((line, index) => { if (/^[\u3400-\u9fff]{2,6}：/.test(line)) lastLabel = index; });
    let exampleAt = note.example ? lines.indexOf(note.example) : -1;
    if (!note.example) exampleAt = lines.findIndex((line, index) => index > lastLabel && !CJK.test(line) && /[a-z]/i.test(line) && /[.!?"”]$/.test(line));
    const example = note.example || (exampleAt >= 0 ? lines[exampleAt] : "");
    let translation = note.exampleTranslation || "";
    if (exampleAt >= 0 && !translation && CJK.test(lines[exampleAt + 1] || "")) translation = lines[exampleAt + 1];
    const rows = [];
    for (const line of lines) {
      if (line === example || line === translation) continue;
      const match = line.match(/^([\u3400-\u9fff]{2,6})：(.*)$/);
      if (match) rows.push({ label: match[1], text: match[2] });
      else if (rows.length) rows[rows.length - 1].text += `\n${line}`;
      else rows.push({ label: "补充", text: line });
    }
    return { meaning, rows, example, translation };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function noteCard(note) {
    const { meaning, rows, example, translation } = parseNote(note);
    const item = document.createElement("details");
    const summary = document.createElement("summary");
    summary.append(element("span", "note-word", note.context), element("span", "note-meaning", meaning));
    if (voice) {
      const read = element("button", "note-speak");
      read.type = "button";
      showSpeaking(read, false);
      read.onclick = (event) => { event.preventDefault(); event.stopPropagation(); speak(note, example, read); };
      summary.append(read);
    }
    const body = element("div", "note-body");
    if (rows.length) {
      const list = element("dl", "note-rows");
      for (const row of rows) list.append(element("dt", "", row.label), element("dd", "", row.text));
      body.append(list);
    }
    if (example) {
      const box = element("div", "note-example");
      box.append(element("strong", "", example));
      if (translation) box.append(element("span", "", translation));
      body.append(box);
    }
    const foot = element("div", "note-foot");
    if (/^https?:\/\//.test(note.source)) {
      const source = element("a", "", "查看原文");
      source.href = note.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      foot.append(source);
    }
    const learned = element("button", "note-learned", "学会了");
    learned.type = "button";
    learned.onclick = async () => {
      learned.disabled = true;
      try {
        await send({ type: "ZILI_ENGLISH_LEARNED", id: note.id });
        await renderLibrary();
      } catch (error) {
        status(error.message);
        learned.disabled = false;
      }
    };
    foot.append(learned);
    body.append(foot);
    item.append(summary, body);
    return item;
  }
  async function renderLibrary() {
    try {
      const notes = (await send({ type: "ZILI_ENGLISH_LIST" })).notes.filter(note => !note.learnedAt);
      const items = dialog.querySelector("[data-items]");
      voice?.stop();
      items.replaceChildren(...notes.slice().sort((a, b) => b.createdAt - a.createdAt).map(noteCard));
      status(notes.length ? "" : "还没有收藏");
    } catch (error) {
      status(error.message);
    }
  }
  libraryButton.onclick = () => { dialog.showModal(); void renderLibrary(); };
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => voice?.stop());

  ZiliRuntime.send({ type: "GET_ENGINE_STATUS" }, { timeoutMs: 10000 })
    .then((response) => {
      if (response?.keyConfigured === false) {
        engine.open = true;
        get("#settingsPanel").hidden = false;
        get("#openSettings").setAttribute("aria-expanded", "true");
      }
    })
    .catch(() => {});
})();
