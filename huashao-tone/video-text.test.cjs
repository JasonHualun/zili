const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(`${__dirname}/video-text.js`, "utf8"), context);
const videoText = context.ZiliVideoText;

test("subtitle window follows seek position and skips distant cues", () => {
  const cues = [
    { startTime: 0, endTime: 4, text: "Old line" },
    { startTime: 50, endTime: 54, text: "<i>Five years exactly</i>" },
    { startTime: 55, endTime: 58, text: "What we are about to do" },
    { startTime: 120, endTime: 124, text: "Far away" }
  ];
  assert.deepEqual(Array.from(videoText.upcomingCues(cues, 51, 15)), [
    "Five years exactly", "What we are about to do"
  ]);
  assert.deepEqual(Array.from(videoText.upcomingCues(cues, 121, 15)), ["Far away"]);
});

test("subtitle response must keep the same number and order of lines", () => {
  assert.deepEqual(Array.from(videoText.parseTranslations('```json\n["五年", "接下来"]\n```', 2)), ["五年", "接下来"]);
  assert.equal(videoText.parseTranslations('["少了一行"]', 2), null);
  assert.equal(videoText.parseTranslations('["", "接下来"]', 2), null);
  assert.deepEqual(Array.from(videoText.parseTranslations('{"translation":"整整五年"}', 1)), ["整整五年"]);
});

test("YouTube English caption request is selected for the current video only", () => {
  const entries = [
    { name: "https://www.youtube.com/api/timedtext?v=other&lang=en&fmt=json3&pot=one", decodedBodySize: 5000 },
    { name: "https://www.youtube.com/api/timedtext?v=current&lang=en&tlang=zh&fmt=json3&pot=two", decodedBodySize: 5000 },
    { name: "https://www.youtube.com/api/timedtext?v=current&lang=en&fmt=json3&pot=three", decodedBodySize: 46010, startTime: 10 },
    { name: "https://www.youtube.com/api/timedtext?v=current&lang=en&fmt=json3&pot=four", decodedBodySize: 46010, startTime: 20 }
  ];
  assert.equal(videoText.youtubeCaptionResource(entries, "https://www.youtube.com/watch?v=current"), entries[3].name);
  assert.equal(videoText.youtubeCaptionResource(entries, "https://www.youtube.com/watch?v=missing"), "");
});

test("YouTube timed captions follow pause and seek without using video audio", () => {
  const cues = videoText.parseYouTubeJson3({ events: [
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
    { tStartMs: 4000, dDurationMs: 2500, segs: [{ utf8: "Next line" }] }
  ] });
  assert.equal(videoText.cueAtTime(cues, 1.5), "Hello world");
  assert.equal(videoText.cueAtTime(cues, 3.5), "");
  assert.equal(videoText.cueAtTime(cues, 5), "Next line");
  assert.deepEqual(Array.from(videoText.upcomingCues(cues, 0, 45)), ["Hello world", "Next line"]);
});

test("YouTube caption loading reuses the playable page request and parses timed lines", async () => {
  const resource = "https://www.youtube.com/api/timedtext?v=current&lang=en&fmt=json3&pot=page-only";
  let requested = "";
  const result = await videoText.fetchYouTubeCues(
    [{ name: resource, decodedBodySize: 46010 }],
    "https://www.youtube.com/watch?v=current",
    async (url, options) => {
      requested = url;
      assert.equal(options.credentials, "include");
      return {
        ok: true,
        text: async () => JSON.stringify({ events: [
          { tStartMs: 4200, dDurationMs: 1200, segs: [{ utf8: "This is a 3." }] }
        ] })
      };
    }
  );
  assert.equal(requested, resource);
  assert.equal(result.found, true);
  assert.equal(result.cues[0].text, "This is a 3.");
  assert.equal(result.cues[0].startTime, 4.2);
});

test("copy-text image task transcribes without translating or summarizing", () => {
  const modelContext = vm.createContext({});
  vm.runInContext(fs.readFileSync(`${__dirname}/deepseek-client.js`, "utf8"), modelContext);
  const prompt = modelContext.ZiliModelClient.buildVisionPrompt({ requestedMode: "copy_text" });
  assert.match(prompt, /逐字转写/);
  assert.match(prompt, /不要翻译、总结/);
  assert.doesNotMatch(prompt, /本地口吻样本/);
});
