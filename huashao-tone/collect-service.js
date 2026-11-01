(function (global) {
  // 本地收纳：把采集到的网页材料交给字里桥（Chrome 原生消息宿主），由用户允许过的本地 Agent 整理进收纳文件夹。
  const HOST = "com.zili.bridge";
  const AGENT_KEY = "ziliCollectAgent";
  const JOBS_KEY = "ziliCollectJobs";
  const JOB_LIMIT = 20;

  function native(message) {
    return new Promise(resolve => {
      if (!chrome.runtime.sendNativeMessage) return resolve({ ok: false, error: "no_permission" });
      chrome.runtime.sendNativeMessage(HOST, message, response => {
        const error = chrome.runtime.lastError;
        if (error) return resolve({ ok: false, error: /not found|forbidden/i.test(error.message || "") ? "bridge_missing" : "bridge_failed", detail: error.message || "" });
        resolve(response || { ok: false, error: "bridge_failed" });
      });
    });
  }

  // detail 是 Chrome 的原话，排查时要看。
  function publicError(error, detail = "") {
    if (error === "no_permission") return "插件还是旧版本：去 chrome://extensions 点字里的刷新按钮，再刷新网页";
    const tail = detail ? `（${detail}）` : "";
    if (error === "bridge_missing") return "还没装字里桥：在终端进入字里文件夹，运行 python3 zili-bridge/install.py，再重新加载插件" + tail;
    if (error === "bridge_failed") return "字里桥没有响应，请重新加载插件后再试" + tail;
    return error || "收纳失败，请重试";
  }

  async function readJobs() {
    const data = await chrome.storage.local.get(JOBS_KEY);
    return Array.isArray(data[JOBS_KEY]) ? data[JOBS_KEY] : [];
  }

  async function agent() {
    const data = await chrome.storage.local.get(AGENT_KEY);
    return data[AGENT_KEY] || "";
  }

  async function detect() {
    const r = await native({ type: "detect" });
    if (!r.ok) return { ok: false, error: publicError(r.error, r.detail) };
    // 只有用户在安装时允许过的 Agent 能选；之前选的不在允许列表里了，就换成第一个允许的。
    const allowed = r.agents.filter(a => a.allowed);
    let selected = await agent();
    if (!allowed.some(a => a.id === selected)) {
      selected = allowed[0]?.id || "";
      await chrome.storage.local.set({ [AGENT_KEY]: selected });
    }
    return { ok: true, agents: allowed, found: r.agents, folder: r.folder, folderOk: r.folderOk, selected };
  }

  async function submit(message) {
    const items = (Array.isArray(message.items) ? message.items : []).slice(0, 30);
    if (!items.length) return { ok: false, error: "没有要收纳的内容" };
    const r = await native({ type: "submit", agent: await agent(), intent: message.intent === "topic" ? "topic" : "save", note: String(message.note || "").slice(0, 500), items });
    if (!r.ok) return { ok: false, error: publicError(r.error, r.detail) };
    const jobs = [{ id: r.id, title: r.title, agent: r.agent, intent: message.intent === "topic" ? "topic" : "save", status: "running", createdAt: Date.now() }, ...await readJobs()].slice(0, JOB_LIMIT);
    await chrome.storage.local.set({ [JOBS_KEY]: jobs });
    return { ok: true, job: jobs[0] };
  }

  // 只向字里桥问还没结束的任务，结果写回本地列表。
  async function refresh() {
    const jobs = await readJobs();
    const pending = jobs.filter(job => job.status === "running").map(job => job.id);
    if (pending.length) {
      const r = await native({ type: "status", ids: pending });
      if (r.ok) {
        const byId = new Map(r.jobs.map(job => [job.id, job]));
        for (const job of jobs) {
          const latest = byId.get(job.id);
          if (latest && latest.status !== "running") Object.assign(job, { status: latest.status, result: latest.result || "", receipt: latest.receipt || "" });
        }
        await chrome.storage.local.set({ [JOBS_KEY]: jobs });
      }
    }
    return { ok: true, jobs };
  }

  function handle(message) {
    if (message.type === "ZILI_COLLECT_DETECT") return detect();
    if (message.type === "ZILI_COLLECT_SUBMIT") return submit(message);
    return refresh();
  }

  global.ZiliCollect = { handle, AGENT_KEY, JOBS_KEY };
})(globalThis);
