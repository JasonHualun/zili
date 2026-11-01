const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');
function load(files, extra = {}) {
  const c = vm.createContext({ console, ...extra });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), c);
  return c;
}
const VAULT_DNA = process.env.ZILI_DNA || path.join(os.homedir(), 'Documents', 'Obsidian Vault', 'LLM Wiki', 'shared', 'skills', 'hualun-writing-core', 'references', 'hualun_author_dna.json');

test('red line blocks the author\'s banned words, patterns and the cross-sentence rename', () => {
  const { ZiliToneGuard: g } = load(['redline-data.js', 'tone-guard.js']);
  for (const output of ['说白了这事很简单', '不是模型不行而是你不会用', '很多人以为要写代码，其实是拼配置', '这不是抱怨。它是一套流程', '首先，打开设置']) {
    assert.equal(g.review({ mode: 'comment', output }).ok, false, output);
  }
  assert.equal(g.review({ mode: 'comment', output: '这个对比做得很实在 Dots 那段终于讲清楚了' }).ok, true);
  assert.equal(g.review({ mode: 'chat', output: '我意识到问题了' }).ok, false);
});

test('words the user wrote themselves are exempt from the red line', () => {
  const { ZiliToneGuard: g } = load(['redline-data.js', 'tone-guard.js']);
  const result = g.review({ mode: 'rewrite', output: '我意识到这个坑太深了', sourceText: '我意识到这个坑太深' });
  assert.ok(!result.violations.includes('redline-word'));
});

test('花伦 is the base voice of every writing prompt; presets only steer it', () => {
  const { ZiliModelClient: c, ToneOptimizer: o } = load(['optimizer.js', 'redline-data.js', 'tone-guard.js', 'deepseek-client.js']);
  assert.equal(o.PRESETS.hualun, undefined);
  for (const style of ['human', 'opinion', 'calm', 'playful']) {
    const prompt = c.buildPrompt({ mode: 'comment', settings: { style, punctuation: 'adaptive', emoji: 'adaptive' } });
    assert.match(prompt, /花伦口吻/, style); assert.match(prompt, /去 AI 味红线/, style); assert.match(prompt, /底层逻辑/, style);
    assert.match(prompt, /在这个底座上往某个方向微调/, style);
  }
  assert.match(c.buildPrompt({ mode: 'comment', settings: { punctuation: 'adaptive' } }), /段末和结尾不加句号/);
  assert.match(c.buildVisionPrompt({ settings: { style: 'human' } }), /花伦口吻/);
});

test('a chat draft that breaks the red line is repaired once before it is shown', async () => {
  const data = {};
  const c = load(['redline-data.js', 'tone-guard.js', 'learning-service.js'], { crypto: require('node:crypto').webcrypto, chrome: { storage: { local: { get: async k => ({ [k]: data[k] }), set: async v => Object.assign(data, v) } } } });
  const calls = [];
  c.ZiliModelClient = {
    voiceInstruction: () => '花伦口吻：测试',
    converse: async input => { calls.push(input); return calls.length === 1 ? { text: JSON.stringify({ text: '写好了', draft: '说白了这个对比很实在' }) } : { text: '这个对比很实在 有点东西' }; }
  };
  const r = await c.ZiliLearning.handle({ type: 'ZILI_ASSIST', action: 'chat', text: '帮我回复这条' }, { readSettings: async () => ({ style: 'playful' }), readModelEngine: async () => ({ provider: 'qwen', apiKeys: { qwen: 'k' }, models: { qwen: 'example' } }) });
  assert.match(calls[0].system, /去 AI 味红线/); assert.match(calls[0].system, /花伦口吻/);
  assert.equal(calls.length, 2); assert.match(calls[1].system, /说白了/);
  assert.equal(r.draft, '这个对比很实在 有点东西');
});

test('the extension\'s word list matches the Vault source of truth', { skip: !fs.existsSync(VAULT_DNA) }, () => {
  const dna = JSON.parse(fs.readFileSync(VAULT_DNA, 'utf8')).negative_constraints;
  const { ZiliRedline: r } = load(['redline-data.js']);
  assert.deepEqual([...r.bannedWords], dna.banned_words, '词库不一致：运行 node scripts/sync-redline.cjs');
  assert.deepEqual([...r.bannedPatterns], dna.banned_patterns);
});

test('short replies drop the closing full stop unless the user chose normal punctuation', () => {
  const { ToneOptimizer: o } = load(['optimizer.js']);
  assert.equal(o.applyPunctuation('出差顺路约个饭挺实在的。', { style: 'playful', punctuation: 'adaptive' }, 'comment'), '出差顺路约个饭挺实在的');
  assert.equal(o.applyPunctuation('还行。', { punctuation: 'normal' }, 'comment'), '还行。');
});

test('the 观点强度 slider sets how far a reply may push back', () => {
  const { ZiliModelClient: c, ZiliToneGuard: g } = load(['optimizer.js', 'redline-data.js', 'tone-guard.js', 'deepseek-client.js']);
  const low = c.buildPrompt({ mode: 'comment', settings: { style: 'human', opinion: 45 } });
  const high = c.buildPrompt({ mode: 'comment', settings: { style: 'opinion', opinion: 85 } });
  assert.match(low, /不挑毛病，不质疑可行性/); assert.doesNotMatch(low, /指出边界、轻微反驳/);
  assert.match(high, /直接说出不同意的地方/);
  const nitpick = '三句话复刻镜头节奏这事我信 麦当劳那支能不能过客户那关';
  assert.ok(g.review({ mode: 'comment', output: nitpick, opinion: 45 }).violations.includes('nitpick-or-advice'));
  assert.ok(!g.review({ mode: 'comment', output: nitpick, opinion: 85 }).violations.includes('nitpick-or-advice'));
});
