const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");

test("a remaining tone heuristic warning does not suppress a requested candidate", () => {
  const source = read("background.js");
  const start = source.indexOf("const toneWarning = review.ok ? null");
  const end = source.indexOf("result.output = globalThis.ToneOptimizer.applyPunctuation", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /violations: review\.violations/);
  assert.doesNotMatch(block, /tone_guard_rejected/);
  assert.match(source, /toneChecked: review\.ok/);
  assert.match(source, /toneWarning/);
});

test("the cost row offers an accessible one-click regenerate shortcut", () => {
  const source = read("content.js");
  assert.match(source, /class="zili-quick-regenerate"[^>]*aria-label="重新生成一版"/);
  assert.match(source, /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*regenerateCandidate\(\);/);
  assert.match(source, /\.zili-quick-regenerate:hover/);
});
