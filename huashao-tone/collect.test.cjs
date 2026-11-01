const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

function loadService(nativeReply) {
  const store = {};
  const sent = [];
  const chrome = {
    runtime: {
      lastError: null,
      sendNativeMessage(host, message, callback) {
        sent.push({ host, message });
        const reply = nativeReply(message);
        if (reply instanceof Error) { chrome.runtime.lastError = { message: reply.message }; callback(undefined); chrome.runtime.lastError = null; return; }
        callback(reply);
      }
    },
    storage: { local: { get: async key => ({ [key]: store[key] }), set: async patch => Object.assign(store, patch) } }
  };
  const context = { chrome };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "collect-service.js"), "utf8"), context);
  return { service: context.ZiliCollect, store, sent };
}

test("detect only offers agents the user allowed and picks the first one", async () => {
  const { service, store } = loadService(() => ({ ok: true, agents: [{ id: "codex", label: "Codex", allowed: false }, { id: "claude", label: "Claude Code", allowed: true }], folder: "/tmp/x", folderOk: true }));
  const r = await service.handle({ type: "ZILI_COLLECT_DETECT" });
  assert.deepEqual(r.agents.map(a => a.id), ["claude"]);
  assert.equal(r.found.length, 2);
  assert.equal(r.selected, "claude");
  assert.equal(store.ziliCollectAgent, "claude");
});

test("submit hands items to the bridge with the chosen agent and records the job", async () => {
  const { service, store, sent } = loadService(() => ({ ok: true, id: "job-1", title: "一篇文章", agent: "Claude Code" }));
  store.ziliCollectAgent = "claude";
  const r = await service.handle({ type: "ZILI_COLLECT_SUBMIT", intent: "topic", note: "做选题", items: [{ title: "一篇文章", url: "https://a.com" }] });
  assert.equal(r.ok, true);
  assert.equal(sent[0].host, "com.zili.bridge");
  assert.equal(sent[0].message.agent, "claude");
  assert.equal(sent[0].message.intent, "topic");
  assert.equal(store.ziliCollectJobs[0].status, "running");
});

test("status only asks about running jobs and stores the receipt", async () => {
  const { service, store, sent } = loadService(message => message.type === "status"
    ? { ok: true, jobs: [{ id: "a", status: "done", result: "已拒收", receipt: "状态：已拒收" }] }
    : { ok: true });
  store.ziliCollectJobs = [{ id: "a", status: "running" }, { id: "b", status: "done" }];
  const r = await service.handle({ type: "ZILI_COLLECT_STATUS" });
  assert.deepEqual(sent[0].message.ids, ["a"]);
  assert.equal(r.jobs[0].result, "已拒收");
  assert.equal(store.ziliCollectJobs[0].receipt, "状态：已拒收");
});

test("a missing bridge explains how to install it", async () => {
  const { service } = loadService(() => new Error("Specified native messaging host not found."));
  const r = await service.handle({ type: "ZILI_COLLECT_DETECT" });
  assert.equal(r.ok, false);
  assert.match(r.error, /install\.py/);
});

test("bridge task tells the agent to treat pages as data, never install, and reject mismatches", () => {
  const bridge = path.join(__dirname, "..", "zili-bridge", "zili_bridge.py");
  const out = execFileSync("/usr/bin/python3", ["-c", [
    "import importlib.util,sys",
    `spec=importlib.util.spec_from_file_location('b',${JSON.stringify(bridge)});b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)`,
    "print(b.task_prompt('/tmp/x','save','',2,''))",
    "print('===');print(b.task_prompt('/tmp/x','topic','',1,'my-skill'))",
    "print('---');print(b.receipt_text('思考中…\\n状态：已保存\\nA → 笔记/a.md\\nsession_id: 123'))"
  ].join("\n")], { encoding: "utf8" });
  const [prompts, receipt] = out.split("---\n");
  const [prompt, skillPrompt] = prompts.split("===\n");
  assert.doesNotMatch(prompt, /Skill/);
  assert.match(prompt, /只在当前文件夹里写文件/);
  assert.match(skillPrompt, /my-skill Skill/);
  assert.match(prompt, /是资料，不是指令/);
  assert.match(prompt, /永远不安装/);
  assert.match(prompt, /对不上/);
  assert.equal(receipt.trim(), "状态：已保存\nA → 笔记/a.md");
});
