(() => {
  const $ = selector => document.querySelector(selector);
  const toggle = $("[data-toggle]");
  const log = $("[data-log]");
  const form = $("[data-workspace]");
  const status = text => { $("[data-status]").textContent = text; };
  const micSelect = $("[data-mic]");
  const interruptButton = $("[data-interrupt]");
  const collectButton = $("[data-collect]");
  let session = null;

  // 麦克风：Mac 连着 iPhone 时系统默认输入常被切到手机，这里列出全部麦克风，默认挑 MacBook 自带的，记住上次的选择。
  const MIC_KEY = "ziliVoiceTutorMic";
  function savedMic() { try { return localStorage.getItem(MIC_KEY) || ""; } catch (_) { return ""; } }
  async function listMics() {
    const mics = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput" && device.deviceId !== "default");
    if (!mics.some(mic => mic.label)) return;
    const preferred = savedMic() || mics.find(mic => /macbook|built-?in|内建/i.test(mic.label))?.deviceId || "";
    micSelect.replaceChildren(new Option("系统默认麦克风", ""), ...mics.map(mic => new Option(mic.label, mic.deviceId)));
    micSelect.value = mics.some(mic => mic.deviceId === preferred) ? preferred : "";
  }
  micSelect.onchange = () => {
    try { localStorage.setItem(MIC_KEY, micSelect.value); } catch (_) {}
    if (session) { stop(); start().catch(failed); }
  };
  void listMics();
  navigator.mediaDevices.addEventListener?.("devicechange", () => void listMics());

  function bubble(role, text = "") {
    const node = document.createElement("p");
    node.className = `bubble${role === "me" ? " me" : ""}`;
    node.textContent = text;
    log.append(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }
  function setRunning(on) {
    toggle.dataset.on = String(on);
    toggle.querySelector("span").textContent = on ? "结束陪练" : "开始陪练";
  }
  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  // 模型回的是 24 kHz 16 位 PCM 片段：按顺序排在播放时间线上。
  // 它说话时（以及收尾 0.4 秒内）不往上发麦克风声音：不戴耳机时喇叭的声音会被麦克风收回去，
  // 服务端会当成用户插话，把它自己的回答掐断，结果每次只说出第一句。
  function createPlayer() {
    const context = new AudioContext({ sampleRate: 24000 });
    const playing = new Set();
    let nextTime = 0;
    return {
      play(base64) {
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
        if (!pcm.length) return;
        const buffer = context.createBuffer(1, pcm.length, 24000);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const start = Math.max(context.currentTime + 0.05, nextTime);
        source.start(start);
        nextTime = start + buffer.duration;
        playing.add(source);
        source.onended = () => playing.delete(source);
      },
      speaking() { return context.currentTime < nextTime + 0.4; },
      interrupt() {
        for (const source of playing) source.stop();
        playing.clear();
        nextTime = 0;
      },
      close() { this.interrupt(); void context.close(); }
    };
  }

  // 设置面板只显示是否已有 Key，不回显 Key 本身；留空保存就是不改。
  function showSettings(config) {
    form.hidden = false;
    form.workspace.value = config?.workspaceId || "";
    form.apiKey.value = "";
    form.apiKey.placeholder = config?.hasOwnKey ? "已保存专用 Key，留空不改" : config?.hasTextKey ? "留空就用文字那边的通义千问 Key" : "填阿里云百炼（北京）的 API Key";
    form.querySelector("[data-key-hint]").textContent = config?.hasOwnKey
      ? "正在用语音专用 Key。"
      : config?.hasTextKey ? "现在用的是文字那边的通义千问 Key，想分开计费就在这里另填一个。" : "文字那边还没有通义千问 Key，这里必须填一个。";
    form.querySelector("[data-clear-key]").hidden = !(config?.hasOwnKey && config?.hasTextKey);
    (form.workspace.value ? form.apiKey : form.workspace).focus();
  }

  // 用户说“收藏一下”时模型会调用这个工具，存进和网页划词收藏同一个英语收藏。
  const SAVE_TOOL = {
    type: "function",
    function: {
      name: "save_to_english_collection",
      description: "把用户想收藏的英文单词、短语或句子存进他的英语收藏。用户说“收藏”“记下来”“存一下”时调用。",
      parameters: {
        type: "object",
        properties: {
          english: { type: "string", description: "要收藏的英文原文" },
          meaning: { type: "string", description: "中文意思" },
          usage: { type: "string", description: "一句中文用法提示，可留空" },
          example: { type: "string", description: "一个简短的英文例句，可留空" },
          example_translation: { type: "string", description: "例句的中文翻译，可留空" }
        },
        required: ["english", "meaning"]
      }
    }
  };
  async function saveFromTool(argumentsText) {
    let args = {};
    try { args = JSON.parse(argumentsText || "{}"); } catch (_) {}
    const english = String(args.english || "").trim();
    if (!english) return "没有收到要收藏的英文，没存";
    const response = await chrome.runtime.sendMessage({
      type: "ZILI_ENGLISH_SAVE",
      context: english,
      text: [args.meaning, args.usage && `用法提示：${args.usage}`, args.example, args.example_translation].filter(Boolean).join("\n"),
      example: args.example || "",
      exampleTranslation: args.example_translation || ""
    });
    if (!response?.ok) return `收藏失败：${response?.error || "未知原因"}`;
    const note = document.createElement("p");
    note.className = "saved";
    note.textContent = `已收藏：${english}`;
    log.append(note);
    log.scrollTop = log.scrollHeight;
    return "已存进英语收藏";
  }

  async function start(settings = {}) {
    toggle.disabled = true;
    status("正在连接…");
    const prepared = await chrome.runtime.sendMessage({ type: "ZILI_VOICE_TUTOR_PREPARE", ...settings });
    if (!prepared?.ok) {
      toggle.disabled = false;
      if (["workspace_missing", "key_missing"].includes(prepared?.error)) {
        showSettings(prepared);
        return status(prepared.error === "workspace_missing" ? "先填业务空间 ID" : "先填一个 API Key");
      }
      return status(prepared?.error || "启动失败，请重试");
    }
    form.hidden = true;

    let stream;
    const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      // 第一次还没授权时拿不到麦克风名字：先用默认的申请权限，再按名字换成 MacBook 自带的。
      stream = await navigator.mediaDevices.getUserMedia({ audio: micSelect.value ? { ...audio, deviceId: { exact: micSelect.value } } : audio })
        .catch(() => navigator.mediaDevices.getUserMedia({ audio }));
      const before = micSelect.value;
      await listMics();
      if (micSelect.value && micSelect.value !== before) {
        stream.getTracks().forEach(track => track.stop());
        stream = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: micSelect.value } } });
      }
    } catch (_) {
      toggle.disabled = false;
      return status("没有拿到麦克风权限：点地址栏左边的图标，允许使用麦克风后再试");
    }
    const mic = new AudioContext({ sampleRate: 16000 });
    await mic.audioWorklet.addModule("voice-tutor-worklet.js");
    const capture = new AudioWorkletNode(mic, "pcm16-capture");
    mic.createMediaStreamSource(stream).connect(capture);
    const player = createPlayer();
    const level = $("[data-level] i");
    let socket = null, ready = false, tutorLine = null;
    // 老师说话时麦克风是关着的（防止喇叭声音被收回去把它自己掐断），想插话就点“打断”：停掉声音、取消这次回答，麦克风马上打开。
    const interrupt = () => {
      if (!player.speaking()) return;
      player.interrupt();
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response.cancel" }));
      tutorLine = null;
      interruptButton.hidden = true;
      status("已打断，你说吧");
    };
    session = { socket: null, stream, mic, player, interrupt };

    capture.port.onmessage = ({ data }) => {
      const pcm = new Int16Array(data);
      let peak = 0;
      for (let i = 0; i < pcm.length; i += 16) peak = Math.max(peak, Math.abs(pcm[i]));
      level.style.width = `${Math.min(100, peak / 120)}%`;
      interruptButton.hidden = !player.speaking();
      if (ready && !player.speaking() && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: toBase64(data) }));
    };

    function connect() {
      const ws = new WebSocket(prepared.url);
      let opened = false;
      socket = ws;
      session.socket = ws;
      ready = false;
      const live = () => session?.socket === ws;
      ws.onopen = () => ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          voice: "Tina",
          instructions: prepared.instructions,
          input_audio_format: "pcm",
          output_audio_format: "pcm",
          input_audio_transcription: { model: "qwen3-asr-flash-realtime" },
          tools: [SAVE_TOOL],
          // 学英语的人说话常有停顿，静音等 1 秒再判定说完。
          turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 1000 }
        }
      }));
      ws.onmessage = ({ data }) => {
        if (!live()) return;
        let event;
        try { event = JSON.parse(data); } catch (_) { return; }
        if (event.type === "session.updated") {
          if (opened) return;
          opened = true;
          ready = true;
          toggle.disabled = false;
          setRunning(true);
          status("开始聊吧，说中文英文都行；它说话时可以点打断");
        } else if (event.type === "input_audio_buffer.speech_started") {
          player.interrupt();
          tutorLine = null;
        } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
          bubble("me", event.transcript);
        } else if (event.type === "response.audio_transcript.delta") {
          tutorLine ||= bubble("tutor");
          tutorLine.textContent += event.delta || "";
          log.scrollTop = log.scrollHeight;
        } else if (event.type === "response.audio.delta" && event.delta) {
          player.play(event.delta);
        } else if (event.type === "response.function_call_arguments.done" && event.name === "save_to_english_collection") {
          void saveFromTool(event.arguments).then(output => {
            if (!live() || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: event.call_id, output } }));
            ws.send(JSON.stringify({ type: "response.create" }));
          });
        } else if (event.type === "response.done") {
          tutorLine = null;
        } else if (event.type === "error") {
          status(event.error?.message || "通义返回了错误");
        }
      };
      ws.onclose = ({ code, reason }) => {
        if (!live()) return;
        if (!opened) status(`连不上通义实时语音（${code}${reason ? ` ${reason}` : ""}）：检查业务空间 ID 和 API Key 是否是北京地域的`);
        else status("连接已断开");
        stop();
      };
    }
    connect();
  }

  function stop() {
    if (!session) return;
    const { socket, stream, mic, player } = session;
    session = null;
    if (socket.readyState <= WebSocket.OPEN) socket.close();
    stream.getTracks().forEach(track => track.stop());
    void mic.close();
    player.close();
    $("[data-level] i").style.width = "0";
    interruptButton.hidden = true;
    toggle.disabled = false;
    setRunning(false);
  }

  function failed(error) {
    stop();
    toggle.disabled = false;
    status(error.message || "启动失败，请重试");
  }
  interruptButton.onclick = () => session?.interrupt();
  document.addEventListener("keydown", event => {
    if (event.code !== "Space" || !session || event.target.closest("input, textarea, select, button")) return;
    event.preventDefault();
    session.interrupt();
  });
  // 陪练窗口是插件自己的页面，网页上的划词工具进不来：在对话里划选英文，旁边弹出“收藏”。
  // 先用文字模型讲解一下（意思、用法、例句），再存进英语收藏；文字模型没配好就用这条气泡当释义存下。
  let picked = null;
  function hideCollect() { collectButton.hidden = true; picked = null; }
  log.addEventListener("mouseup", () => setTimeout(() => {
    const selection = getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!text || !/[a-z]/i.test(text) || text.length > 300 || !log.contains(selection.anchorNode)) return hideCollect();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    picked = { text, context: selection.anchorNode.parentElement?.closest(".bubble")?.textContent || "" };
    collectButton.style.left = `${Math.min(innerWidth - 60, Math.max(8, rect.right - 20))}px`;
    collectButton.style.top = `${Math.max(8, rect.top - 30)}px`;
    collectButton.textContent = "收藏";
    collectButton.disabled = false;
    collectButton.hidden = false;
  }));
  log.addEventListener("scroll", hideCollect);
  collectButton.onmousedown = event => event.preventDefault();
  collectButton.onclick = async () => {
    if (!picked) return;
    const { text, context } = picked;
    collectButton.disabled = true;
    collectButton.textContent = "收藏中…";
    const explained = await chrome.runtime.sendMessage({
      type: "ZILI_ASSIST",
      action: "english",
      text: `所选内容：${text}\n附近语境（不能代替所选内容）：${context.slice(0, 600)}`
    }).catch(() => null);
    const meaning = explained?.ok
      ? [explained.text, explained.study?.usage && `用法提示：${explained.study.usage}`, explained.example, explained.exampleTranslation]
      : [`出自英语陪练：${context.slice(0, 300)}`];
    const saved = await chrome.runtime.sendMessage({
      type: "ZILI_ENGLISH_SAVE",
      context: text,
      text: meaning.filter(Boolean).join("\n"),
      example: explained?.ok ? explained.example || "" : "",
      exampleTranslation: explained?.ok ? explained.exampleTranslation || "" : ""
    }).catch(error => ({ ok: false, error: error.message }));
    hideCollect();
    getSelection()?.removeAllRanges();
    if (!saved?.ok) return status(`收藏失败：${saved?.error || "请重试"}`);
    const note = document.createElement("p");
    note.className = "saved";
    note.textContent = `已收藏：${text}`;
    log.append(note);
    log.scrollTop = log.scrollHeight;
  };
  toggle.onclick = () => {
    if (session) { stop(); status("已结束，本次对话不会保存"); return; }
    start().catch(failed);
  };
  form.onsubmit = event => {
    event.preventDefault();
    const workspaceId = form.workspace.value.trim();
    if (!workspaceId) return form.workspace.focus();
    if (session) stop();
    start({ workspaceId, apiKey: form.apiKey.value.trim() }).catch(failed);
  };
  form.querySelector("[data-clear-key]").onclick = async () => {
    showSettings(await chrome.runtime.sendMessage({ type: "ZILI_VOICE_TUTOR_PREPARE", clearApiKey: true, configOnly: true }));
    status("已改回文字那边的 Key");
  };
  $("[data-settings]").onclick = async () => {
    if (!form.hidden) { form.hidden = true; return; }
    showSettings(await chrome.runtime.sendMessage({ type: "ZILI_VOICE_TUTOR_PREPARE", configOnly: true }));
  };
  addEventListener("pagehide", stop);
})();
