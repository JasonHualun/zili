(function initZiliToneGuard(global) {
  const RULES = [
    {
      id: "empty-conclusion",
      pattern: /真正重要的是|真正的关键是|这不仅仅?是|从更大的角度看|原因很简单|综上所述/,
      feedback: "删掉没有新增信息的总结或升华，直接说具体判断。"
    },
    {
      id: "empty-praise-turn",
      pattern: /(?:这个|这种|这).{0,12}(?:挺|很|有点).{0,12}(?:有意思|值得|不错).{0,100}(?:听起来.{0,60})?(?:不过|但是)|听起来.{0,100}(?:不过|但是)/,
      feedback: "删掉“挺有意思、听起来、不过”这类先夸再转折的模板，直接回应其中一个具体点。"
    },
    {
      id: "canned-frame",
      pattern: /^(?:核心问题是|关键区别在于|值得注意的是|归根结底|说到底|本质上|关键还是看|关键看)[，,:：]?/,
      feedback: "删掉模板化领起语，直接写后面的具体判断。"
    },
    {
      id: "fake-consensus",
      pattern: /大家都知道|我们都知道|很多人认为|经常有人问|所有人都认为/,
      feedback: "没有材料支持时，不要虚构大家都认同的共识。"
    },
    {
      id: "empty-escalation",
      pattern: /这不仅仅?是.{0,60}(?:更是|也是)/,
      feedback: "删掉“不仅是、更是”的空洞拔高，保留材料支持的具体影响。"
    },
    {
      id: "slogan-ending",
      pattern: /(?:让我们)?(?:一起)?拥抱变化|未来可期|共赴未来|开启新篇章|拭目以待[。！!]?$/,
      feedback: "删掉口号式收尾，内容说完就结束。"
    },
    {
      id: "ai-concede",
      pattern: /这点我认|这一点我认|这个我认|不得不(?:说|承认)|说实话|坦白(?:说|讲)|老实说/,
      feedback: "删掉“这点我认、说实话、不得不说”这类 AI 腔表态，直接说你的反应或判断。"
    },
    {
      id: "echo-pair",
      pattern: /是真[^，,。！？!?\s]{1,6}[，,\s].{0,14}?也是真|([\u4e00-\u9fff]{1,3})是真\1|同时成立/,
      feedback: "删掉“糙是真糙、A是真A也是真B、两件事同时成立”这种对仗绕口令，直接说一个具体的事或感受。"
    },
    {
      id: "collective-reflection",
      pattern: /我们(?:平时|总是|往往|常常)?太?习惯(?:了|用|于|去)|我们(?:每个人|所有人)都/,
      feedback: "别替所有人总结“我们太习惯…”，只说你自己看到的、想到的具体东西。"
    },
    {
      id: "marketing-jargon",
      pattern: /赋能|撬动|抓手|闭环|沉淀价值|价值落地/,
      feedback: "把营销黑话换成具体的人话。"
    },
    {
      id: "vague-action",
      pattern: /搞顺|跑起来|能力落下去|把结果丢回来|吃下上下文|承接需求/,
      feedback: "把含糊动作换成具体判断或具体做法。"
    },
    {
      id: "meta-preview",
      pattern: /(?:这篇|这次|今天).{0,10}(?:一次)?讲(?:清楚|明白)|接下来(?:带你|我们).{0,14}(?:了解|看看|分析)|下面(?:我们)?(?:来)?(?:深入)?(?:分析|拆解|聊聊)|看完.{0,8}(?:明白|清楚)|全面解析|深度拆解/,
      feedback: "不要预告接下来要怎么写，直接给事实、判断或做法。"
    },
    {
      id: "importance-announcement",
      pattern: /真正想聊的是一个更大的问题|这(?:也)?是.{0,24}最值得.{0,16}(?:看|关注|思考)的地方|真正拉开差距的是|更值得注意的是|(?:这套|这个|这种).{0,16}才是真正的关键/,
      feedback: "不要空泛宣布这里很重要，直接写清楚具体哪里重要。"
    },
    {
      id: "generic-summary",
      pattern: /这至少说明一件事|整场.{0,16}绕不开一个核心|这也解释了为什么|归根结底|总的来说|在这个时代|未来已经到来/,
      feedback: "删掉万能总结句；如果没有新增信息，内容说完就停。"
    }
  ];

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function compact(value) {
    return clean(value).replace(/[，。！？、；：,.!?;:'"“”‘’（）()[\]{}《》<>—\-_\s]/g, "");
  }

  function findCopiedReference(output, reference, sourceText) {
    if (!reference) return false;
    const compactOutput = compact(output);
    const compactSource = compact(sourceText);
    const sentences = String(reference)
      .split(/[。！？!?\n]+/)
      .map(compact)
      .filter(sentence => sentence.length >= 8);

    return sentences.some(sentence =>
      compactOutput.includes(sentence) && !compactSource.includes(sentence)
    );
  }

  // The author's red line (hualun-writing-core). Words and patterns come from redline-data.js,
  // which scripts/sync-redline.cjs generates from the Vault; the structural checks below are the
  // machine-checkable parts of 红笔规则全文.
  const REDLINE_STRUCTURES = [
    { id: "redline-cross-sentence-rename", pattern: /不是[^。！？!?\n]{1,30}[。！？!?]\s*(?:它|这|那)?(?:才|无非|就)?是/, feedback: "“不是A。它是B”是“不是……而是……”的断句变体，同样禁止，改成直接写动作或事实。" },
    { id: "redline-ordinal-announcing", pattern: /(?:^|[。！？!?\n])\s*(?:首先|其次|再次)[，,]/, feedback: "删掉“首先、其次、再次”的报幕腔，按事情本身的先后自然说。" },
    { id: "redline-empty-colon", pattern: /(?:一句话总结|总结一下|核心是|原因如下|主要表现为以下几点|常见场景如下)[:：]/, feedback: "删掉空转冒号前的提示语，直接写内容。" },
    { id: "redline-role-metaphor", pattern: /像(?:一位|一个|个)?[^，。！？\n]{0,6}(?:导师|管家|助手|老师|伙伴)/, feedback: "不要把工具拟人成导师、管家、助手，直接写它实际做了什么。" },
    { id: "redline-abstract-metaphor", pattern: /(?:说明书|齿轮|蓝图|引擎)/, feedback: "删掉凭空造出来的比喻（说明书、齿轮、蓝图、引擎），换成具体的动作或反应。" }
  ];

  function patternFromRedline(text) {
    // "……" and the placeholder letters (A, B) in the source list both stand for "any words here".
    const parts = String(text).split(/……|…|\.{3,}|[A-Z]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean);
    return new RegExp(parts.join("[^。！？!?\\n]{0,40}"));
  }

  function redline() {
    const data = global.ZiliRedline || {};
    return {
      words: (data.bannedWords || []).filter(word => !/……|…/.test(word)),
      patterns: [...(data.bannedPatterns || []), ...(data.bannedWords || []).filter(word => /……|…/.test(word))]
        .map(text => ({ text, pattern: patternFromRedline(text) })),
      styles: data.bannedStyles || []
    };
  }

  // Lines the user wrote themselves are exempt, as in the red-pen script's author-quote rule.
  function redlineViolations(output, sourceText) {
    const source = clean(sourceText);
    const { words, patterns } = redline();
    const hits = [];
    const hitWords = words.filter(word => output.includes(word) && !source.includes(word));
    if (hitWords.length) hits.push({ id: "redline-word", feedback: `删掉这些红线禁用词：${hitWords.join("、")}。` });
    const hitPatterns = patterns.filter(item => item.pattern.test(output) && !item.pattern.test(source)).map(item => item.text);
    if (hitPatterns.length) hits.push({ id: "redline-pattern", feedback: `删掉这些红线句式：${hitPatterns.join("、")}，改成直接写动作或事实。` });
    for (const rule of REDLINE_STRUCTURES) {
      if (rule.pattern.test(output) && !rule.pattern.test(source)) hits.push(rule);
    }
    return hits;
  }

  function redlineInstruction() {
    const { words, patterns, styles } = redline();
    return [
      "去 AI 味红线（用户本人的写作规范，必须遵守）：",
      words.length ? `- 禁用词：${words.join("、")}` : "",
      patterns.length ? `- 禁用句式：${patterns.map(item => item.text).join("、")}；“不是A。它是B”这种断句变体同样禁止` : "",
      styles.length ? `- 禁用写法：${styles.join("、")}` : "",
      "- 不用“首先、其次、再次”报幕；不用“一句话总结：”“核心是：”这类空转冒号；不用破折号制造假悬念",
      "- 不把工具拟人成导师、管家、助手；不凭空造比喻（机器、说明书、齿轮、蓝图）",
      "- 不写新闻报告腔，不预设问题再自问自答，不追加泛泛建议、同义总结或升华，说完就停",
      "- 没做过的不写成亲测，不编造经历；能被核实的事实必须真实，体感上的夸张对比可以用",
      "- 保留自然设问和具体的生活比喻，保留原文里“可能”这类限定词"
    ].filter(Boolean).join("\n");
  }

  function countMatches(value, pattern) {
    return (String(value || "").match(pattern) || []).length;
  }

  function countContrastFrames(output) {
    return [
      /不是[^。！？!?\n]{1,60}而是/g,
      /(?:不只是|不仅是)[^。！？!?\n]{1,60}(?:更是|也是)/g,
      /与其[^。！？!?\n]{1,60}不如/g,
      /从[^，。！？!?\n\s]{2,16}[，,\s]+到[^，。！？!?\n\s]{2,16}/g
    ].reduce((total, pattern) => total + countMatches(output, pattern), 0);
  }

  function review(input = {}) {
    const mode = String(input.mode || "rewrite");
    const output = clean(input.output);
    if (!output || mode === "translate") {
      return { ok: true, violations: [], feedback: "" };
    }

    const violations = [];
    const feedback = [];
    const writingMode = mode === "comment" || mode === "rewrite" || mode === "expand" || mode === "chat";

    if (writingMode) {
      for (const hit of redlineViolations(output, input.sourceText)) {
        violations.push(hit.id);
        feedback.push(hit.feedback);
      }
      for (const rule of RULES) {
        if (!rule.pattern.test(output)) continue;
        violations.push(rule.id);
        feedback.push(rule.feedback);
      }

      const contrastFrames = countContrastFrames(output);
      if (contrastFrames >= 2) {
        violations.push("contrast-stacking");
        feedback.push("对照句太工整、太密。只保留真正有必要的一处，其他地方直接说具体内容。");
      }

      const parallelRoles = countMatches(output, /[A-Za-z\u4e00-\u9fff]{1,24}\s*负责/g);
      if (parallelRoles >= 3) {
        violations.push("parallel-stacking");
        feedback.push("不要连续用“谁负责什么”的三段式排比，改成自然句子并保留具体关系。");
      }

      const hasConfirmedReaction = /^(?:这可以|可以(?:呀)?|这个不错|太行|太可以了|确实|是这意思|有点东西|哎|是这样吗|真的吗|这样子|笑死|哈哈)/.test(output)
        || /哈哈$/.test(output);
      const hasColloquialMarker = /说白了|咱们|啥|其实|你有没有发现|问题来了/.test(output)
        || hasConfirmedReaction;
      const templateViolations = new Set([
        "empty-conclusion",
        "canned-frame",
        "empty-escalation",
        "meta-preview",
        "importance-announcement",
        "generic-summary",
        "contrast-stacking",
        "parallel-stacking"
      ]);
      if (hasColloquialMarker && violations.some(id => templateViolations.has(id))) {
        violations.push("fake-colloquial-template");
        feedback.push("加口头词不等于聊天感。删掉口头开场后的标准答案、工整排比或万能总结，直接说具体内容。");
      }

      const formalMarks = output.match(/[，。；：]/g) || [];
      if (input.punctuation === "sparse" && output.length <= 100 && (formalMarks.length >= 3 || /[；：]/.test(output))) {
        violations.push("formal-punctuation");
        feedback.push("标点太像文章。减少逗号和句号，短回复结尾不加句号，能用空格自然断句就不要堆正式标点。");
      }

      const dialectMarkers = [
        "这样子",
        "有没有",
        "啥",
        "咱们",
        "咋",
        "整明白",
        "唠唠",
        "我是觉得",
        "对不对",
        "是这意思吗"
      ]
        .filter(marker => output.includes(marker)).length;
      if (output.length <= 100 && dialectMarkers >= 3) {
        violations.push("dialect-stuffing");
        feedback.push("方言痕迹太密。只保留当前语境里真正会说的一两个表达，不要机械塞词或扮演口音。");
      }

      // With the opinion slider below 60 a reply should pick up the thread, not audit it.
      const opinion = Number(input.opinion);
      if (mode === "comment" && (!Number.isFinite(opinion) || opinion < 60)
        && /能不能|靠不靠谱|行不行得通|建议(?:你|先|还是)|最好(?:先|还是)|要注意|得看|就看|过不过|经不经得起/.test(output)
        && !/能不能|靠不靠谱|建议/.test(clean(input.sourceText))) {
        violations.push("nitpick-or-advice");
        feedback.push("这是顺着对方接话的回复。不要质疑能不能做到、不要给对方提建议，换成你的真实反应、好奇或一句自己的经验。");
      }

      const sourceHasQuestion = /[？?]/.test(clean(input.sourceText));
      if (!input.allowQuestion && !sourceHasQuestion && /[？?]/.test(output)) {
        violations.push("forced-question");
        feedback.push("原文没有提问，不要为了互动追加问句；改成一句明确的陈述。");
      }

      if (input.replyContext === "emotional-vent") {
        if (/(?:不过|但是).{0,64}(?:GPT|Kimi|Claude|模型)|没那么能打|各有各的烂|理性一点|客观一点/.test(output)) {
          violations.push("vent-counterargument");
          feedback.push("原文是在气头上说具体损失。不要用“不过”转去评价模型强弱或反驳情绪，先接住损失本身。")
        }
        if (!/(?:卧槽|太离谱|太惨|真难受|确实|操蛋|这谁受得了|号.{0,8}(?:没|丢|封)|账号.{0,8}(?:没|丢|封)|半年.{0,8}(?:没|丢|封))/.test(output)) {
          violations.push("vent-no-empathy");
          feedback.push("这是一段情绪宣泄。用一句贴着具体损失的自然反应接住他，不讲道理、不转移话题。")
        }
      }

      if (findCopiedReference(output, input.reference, input.sourceText)) {
        violations.push("copied-reference");
        feedback.push("只借用户本地口吻样本的节奏和语气，不要照抄其中的完整句子。");
      }
    }

    const uniqueViolations = [...new Set(violations)];
    const uniqueFeedback = [...new Set(feedback)];
    return {
      ok: uniqueViolations.length === 0,
      violations: uniqueViolations,
      feedback: uniqueFeedback.join(" ")
    };
  }

  global.ZiliToneGuard = { review, redlineInstruction };
})(typeof globalThis !== "undefined" ? globalThis : self);
