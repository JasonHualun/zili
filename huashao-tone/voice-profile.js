(function initZiliVoiceProfile(global) {
  const START = "【个人表达档案 v1】";
  const END = "【表达档案结束】";
  const PROFILE_BLOCK = /【个人表达档案 v1】[\s\S]*?【表达档案结束】/g;

  const LABELS = {
    scene: {
      social: "社交回复",
      post: "发帖分享",
      work: "工作沟通",
      mixed: "都会用"
    },
    tone: {
      direct: "直接自然",
      gentle: "温和一点",
      playful: "轻松一点",
      adaptive: "看场景调整"
    },
    disagreement: {
      direct: "直接说不同意",
      acknowledge: "先认同一部分",
      question: "用反问确认",
      brief: "简短带过"
    }
  };

  function cleanLine(value, max = 120) {
    return String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, max);
  }

  function sampleLines(value) {
    return String(value || "")
      .split(/\n\s*\n|\n/)
      .map(item => cleanLine(item, 180))
      .filter(Boolean)
      .slice(0, 3);
  }

  function hasPersonalData(input = {}) {
    return [
      input.agree,
      input.strongAgree,
      input.doubt,
      input.surprise,
      input.avoid,
      input.signature,
      ...sampleLines(input.samples)
    ].some(value => cleanLine(value));
  }

  function buildProfile(input = {}) {
    if (!hasPersonalData(input)) return "";
    const lines = [
      START,
      `主要场景：${LABELS.scene[input.scene] || LABELS.scene.mixed}`,
      `整体感觉：${LABELS.tone[input.tone] || LABELS.tone.adaptive}`,
      `不认同时：${LABELS.disagreement[input.disagreement] || LABELS.disagreement.acknowledge}`,
      "【常用表达】"
    ];
    const expressions = [
      ["认同", input.agree],
      ["强认同", input.strongAgree],
      ["不太认同", input.doubt],
      ["意外或觉得有意思", input.surprise],
      ["避免使用", input.avoid],
      ["代表性表达", input.signature]
    ];
    for (const [label, value] of expressions) {
      const cleaned = cleanLine(value, 80);
      if (cleaned) lines.push(`${label}：${cleaned}`);
    }
    const samples = sampleLines(input.samples);
    if (samples.length) {
      lines.push("【真实表达样例】");
      samples.forEach((sample, index) => lines.push(`${index + 1}. ${sample}`));
    }
    lines.push("【使用边界】");
    lines.push("只学习句长、词序、口语节奏、标点和判断方式；不照抄整句，不继承样例里的事实与身份。");
    lines.push(END);
    return lines.join("\n");
  }

  function mergeProfile(existing, profile) {
    const normalizedProfile = String(profile || "").trim();
    const source = String(existing || "").trim();
    if (!normalizedProfile) return source;
    const remaining = source.replace(PROFILE_BLOCK, "").trim();
    return [normalizedProfile, remaining].filter(Boolean).join("\n\n");
  }

  function blankTemplate() {
    return [
      "我的表达方式",
      "主要场景：",
      "整体感觉：",
      "不认同时我通常怎么回应：",
      "认同时我通常会说（例如：哈哈 真棒）：",
      "非常认同时我通常会说（例如：太可以了）：",
      "不太认同时我通常会说（例如：是这样吗）：",
      "觉得有意思或意外时我会说（例如：有点东西）：",
      "我不喜欢出现的说法（例如：总的来说）：",
      "一句最像我的话（例如：能不能赚钱 做了才知道）：",
      "真实表达样例（例如：这可以 先试试看）："
    ].join("\n");
  }

  global.ZiliVoiceProfile = {
    START,
    END,
    buildProfile,
    mergeProfile,
    hasPersonalData,
    blankTemplate
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
