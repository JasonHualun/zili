const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("method router is loaded before content and has local storage plumbing", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.indexOf("method-library.js") >= 0);
  assert.ok(scripts.indexOf("method-library.js") < scripts.indexOf("content.js"));
  assert.match(read("background.js"), /GET_METHOD_CARDS/);
  assert.match(read("background.js"), /SAVE_METHOD_CARDS/);
  assert.match(read("popup.html"), /<script src="method-library\.js"><\/script>/);
});

test("showing a method recommendation never sends a model request or sends the chat", () => {
  const source = read("content.js");
  const start = source.indexOf("function showMethodRecommendation(");
  const end = source.indexOf("function requestManualRewrite(", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /\bsend\s*\(/);
  assert.doesNotMatch(block, /\.click\s*\(/);

  const writeStart = source.indexOf("function writeMethodToComposer(");
  const writeEnd = source.indexOf("async function writeCommentToReply(", writeStart);
  const writeBlock = source.slice(writeStart, writeEnd);
  assert.match(writeBlock, /replaceComposer\(/);
  assert.doesNotMatch(writeBlock, /\.click\s*\(/);
  assert.match(source, /zili-manual-actions \{ display: grid; grid-template-columns: 1fr 1fr/);
  assert.doesNotMatch(source, /zili-method-check/);
  const manualStart = source.indexOf("function requestManualRewrite(");
  const manualEnd = source.indexOf("function candidateSettings(", manualStart);
  const manualBlock = source.slice(manualStart, manualEnd);
  assert.match(manualBlock, /methodRecommendationFor\(composer\)/);
  assert.match(manualBlock, /showMethodRecommendation\(composer, \{ manual: true \}\)/);
});

test("AI method intake is explicit, can ask one missing-detail question, and never writes before confirmation", () => {
  const background = read("background.js");
  const popup = read("popup.js");
  assert.match(background, /message\?\.type === "ZILI_METHOD_INTAKE"/);
  assert.match(background, /kind.*question/);
  assert.match(background, /kind.*candidate/);
  assert.match(popup, /type: "ZILI_METHOD_INTAKE"/);
  assert.match(popup, /saveGeneratedMethodCard/);
  assert.ok(popup.indexOf('type: "ZILI_METHOD_INTAKE"') < popup.indexOf("async function saveGeneratedMethodCard"));
});

test("architect mode is explicit, uses the configured API only through its own route, and keeps writing user-controlled", () => {
  const optimizer = read("optimizer.js");
  const content = read("content.js");
  const background = read("background.js");
  const popup = read("popup.js");
  assert.match(optimizer, /architectMode:\s*false/);
  assert.match(read("popup.html"), /开启架构师模式/);
  assert.match(popup, /architectMode: document\.querySelector\("#architectMode"\)/);
  assert.match(background, /message\?\.type === "ZILI_ARCHITECT_ROUTE"/);
  assert.match(background, /parseArchitectResponse/);
  const routeStart = content.indexOf("async function routeArchitectIntent(");
  const routeEnd = content.indexOf("function showMethodRecommendation(", routeStart);
  const routeBlock = content.slice(routeStart, routeEnd);
  assert.match(routeBlock, /type: "ZILI_ARCHITECT_ROUTE"/);
  assert.match(routeBlock, /state\.architectRoutedText === sourceText/);
  assert.doesNotMatch(routeBlock, /replaceComposer\(/);
  assert.doesNotMatch(routeBlock, /\.click\s*\(/);
});
