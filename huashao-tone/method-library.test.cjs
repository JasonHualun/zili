const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const context = {};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/method-library.js`, 'utf8'), context);
  return context.ZiliMethodLibrary;
}

test('the bundled method library covers the agreed first V0 set', () => {
  const library = load();
  assert.equal(library.BUILTINS.length, 18);
  for (const id of ['architecture-advisor', 'musk-five-step', 'grill-me', 'fable-explainer', 'jtbd']) {
    assert.ok(library.BUILTINS.some(item => item.id === id), `missing ${id}`);
  }
});

test('beginner wording routes locally on AI chat pages without a model request', () => {
  const library = load();
  const cases = [
    ['我有个想法但不知道怎么开始', 'architecture-advisor'],
    ['AI 已经加了好多功能越来越复杂，我不知道该删哪里', 'musk-five-step'],
    ['这个东西到底帮谁，用户真正麻烦在哪里', 'jtbd'],
    ['你来挑我的毛病，我怕方案没想全', 'grill-me'],
    ['这个概念我听不懂，别讲术语讲个故事', 'fable-explainer']
  ];
  for (const [text, expectedId] of cases) {
    const result = library.recommend(text, { hostname: 'chatgpt.com' });
    assert.equal(result?.id, expectedId, text);
    assert.match(result.reason, /识别到/);
  }
  assert.equal(library.recommend('JTBD', { hostname: 'codex.com' })?.id, 'jtbd');
});

test('local signal combinations accept natural variations instead of requiring an exact trigger sentence', () => {
  const library = load();
  const cases = [
    ['我脑子里有个点子，但完全不知道从哪里下手', 'architecture-advisor'],
    ['功能和自动化堆太多了，想删掉一部分重新做简单点', 'musk-five-step'],
    ['用户到底卡在哪里，为什么会想换掉现在的办法', 'jtbd'],
    ['这个问题反复出现，根本原因是什么', 'five-whys'],
    ['这两个方案怎么权衡，到底选哪个', 'decision-matrix']
  ];
  for (const [text, expectedId] of cases) {
    assert.equal(library.recommend(text, { hostname: 'chatgpt.com' })?.id, expectedId, text);
  }
});

test('ordinary sites and excluded situations remain quiet', () => {
  const library = load();
  assert.equal(library.recommend('我有个想法但不知道怎么开始', { hostname: 'example.com' }), null);
  assert.equal(library.recommend('帮我把这句话润色一下', { hostname: 'chatgpt.com' }), null);
});

test('custom cards are local bounded records and their prompt is only rendered on explicit use', () => {
  const library = load();
  const custom = library.normalizeCustomCard({
    name: '我的复盘法',
    expert: '复盘',
    beginner: '帮我看看哪里没做好',
    prompt: '请复盘：{draft}'
  });
  assert.match(custom.id, /^custom-/);
  const found = library.recommend('帮我看看哪里没做好', { hostname: 'claude.ai', customCards: [custom] });
  assert.equal(found?.name, '我的复盘法');
  assert.equal(library.renderPrompt(found, '这次发帖没有效果'), '请复盘：这次发帖没有效果');
  assert.equal(library.normalizeCustomCards(Array.from({ length: 101 }, () => custom)).length, 1);
});

test('AI intake accepts one focused question or a valid candidate, never an incomplete card', () => {
  const library = load();
  const question = library.parseIntakeResponse('{"kind":"question","question":"它主要帮谁解决什么问题？"}');
  assert.equal(question?.kind, 'question');
  assert.equal(question?.question, '它主要帮谁解决什么问题？');
  const candidate = library.parseIntakeResponse(JSON.stringify({
    kind: 'candidate',
    card: {
      name: '复盘法',
      beginner: ['帮我看看哪里没做好'],
      prompt: '请复盘：{draft}'
    }
  }));
  assert.equal(candidate?.kind, 'candidate');
  assert.equal(candidate?.card.name, '复盘法');
  assert.equal(library.parseIntakeResponse('{"kind":"candidate","card":{"name":"缺 Prompt"}}'), null);
});

test('architect mode accepts a semantic router result only when it names a known method', () => {
  const library = load();
  const method = library.parseArchitectResponse('{"kind":"method","methodId":"jtbd","reason":"在问用户为什么要换方案"}');
  assert.equal(method?.kind, 'method');
  assert.equal(method?.method.id, 'jtbd');
  assert.equal(method?.reason, '在问用户为什么要换方案');
  assert.equal(library.parseArchitectResponse('{"kind":"method","methodId":"made-up"}'), null);
  assert.equal(library.parseArchitectResponse('{"kind":"none"}')?.kind, 'none');
  assert.equal(library.parseArchitectResponse('{"kind":"question","question":"这次想先解决谁的什么问题？"}')?.kind, 'question');
  assert.equal(library.catalog().length, library.BUILTINS.length);
});
