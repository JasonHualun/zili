(function initZiliSelection(global) {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isOwnedNode(node, roots = [], hosts = []) {
    if (hosts.filter(Boolean).some(host => node === host || host.contains?.(node))) return true;
    if (!node || typeof node.getRootNode !== "function") return false;
    const root = node.getRootNode();
    return roots.filter(Boolean).includes(root);
  }

  function isOwnedSelection(selection, options = {}) {
    const roots = Array.isArray(options.roots) ? options.roots.filter(Boolean) : [];
    const hosts = Array.isArray(options.hosts) ? options.hosts.filter(Boolean) : [];
    if (options.pointerOwned === true) return true;
    if (!selection) return false;

    const nodes = [selection.anchorNode, selection.focusNode];
    if (selection.rangeCount > 0 && typeof selection.getRangeAt === "function") {
      const range = selection.getRangeAt(0);
      nodes.push(range?.commonAncestorContainer, range?.startContainer, range?.endContainer);
    }
    if (nodes.some(node => isOwnedNode(node, roots, hosts))) return true;

    return roots.some(root => {
      const rootSelection = typeof root.getSelection === "function" ? root.getSelection() : null;
      return Boolean(rootSelection?.rangeCount && clean(rootSelection.toString()));
    });
  }

  function looksLikeTerm(text) {
    const source = clean(text);
    if (!source || /[。！？?!；;：:]/.test(source)) return false;

    const englishWords = source.match(/[A-Za-z][A-Za-z0-9+.#/-]*/g) || [];
    const hasChinese = /[\u3400-\u9fff]/.test(source);
    const knownShortTerm = /^(智能体|模型|向量|嵌入|推理|微调|提示词|算力|接口|插件|节点|工作流|知识库|数据库|自动化|检索增强生成)$/;
    if (hasChinese && knownShortTerm.test(source)) return true;

    const predicate = /我|你|他|她|我们|他们|是|能|会|可以|应该|需要|正在|已经|没有|让|把|被|做|觉得|认为|真的|很|更|最/;
    if (hasChinese) {
      return source.length <= 16 && !predicate.test(source);
    }

    const englishPredicate = /\b(?:am|is|are|was|were|be|been|will|would|can|could|should|has|have|had|do|does|did|make|makes|made|build|builds|reshape|reshapes|change|changes|use|uses|used)\b/i;
    return englishWords.length > 0
      && englishWords.length <= 4
      && !englishPredicate.test(source);
  }

  function isMostlyEnglish(text) {
    const source = clean(text);
    const latinCount = (source.match(/[A-Za-z]/g) || []).length;
    const chineseCount = (source.match(/[\u3400-\u9fff]/g) || []).length;
    if (chineseCount >= 8) {
      const chineseSegments = source.match(/[\u3400-\u9fff]{2,}/g) || [];
      const chineseSentenceSignals = /(?:我|你|他|她|我们|这|那|是|有|把|让|先|再|而|但|因为|所以|如果|真正|工作|不是|而是|可以|需要|已经|不会|不能|最后|遇到|失败|定位|结果|问题)/;
      if (chineseSegments.some(segment => segment.length >= 3) && chineseSentenceSignals.test(source)) {
        return false;
      }
    }
    return latinCount >= 4 && latinCount > chineseCount * 2;
  }

  function looksLikeMathQuestion(text) {
    const source = clean(text);
    const explicitExpression = /(?:\d+(?:\.\d+)?|[A-Za-z])\s*(?:[+\-*/×÷^=]|[<>≤≥])\s*(?:\d+(?:\.\d+)?|[A-Za-z])/i.test(source);
    const mathContext = /(?:方程|函数|几何|概率|面积|体积|周长|数学题|计算题|算式|求导|积分|矩阵)/.test(source);
    const asksForResult = /[?？]|(?:等于多少|是多少|算一下|计算一下|结果(?:是|为)?|答案(?:是|为)?)|^(?:请)?(?:求|解|算|计算)/.test(source);
    const hasMathSignal = explicitExpression || mathContext;
    return hasMathSignal && asksForResult;
  }

  function hasExplicitAnswerRequest(text) {
    const source = clean(text);
    return /(?:请问|想问(?:一下)?|想请教(?:一下)?|请教(?:一下)?|求助|请分别回答|麻烦(?:问|帮)|请(?:帮我)?(?:回答|解答|分析|查询|查一下|搜索)|帮我(?:回答|解答|分析|查询|查一下|搜索)|能否帮我)/.test(source);
  }

  function hasStoryAfterQuestion(text) {
    const source = clean(text);
    const questionIndex = Math.max(source.lastIndexOf("?"), source.lastIndexOf("？"));
    if (questionIndex < 0) return false;
    const trailing = source
      .slice(questionIndex + 1)
      .replace(/^[”’"'）)\]】\s]+/, "")
      .trim();
    if (trailing.length < 6) return false;

    const selfAnswer = /^(?:因为|原因是|答案是|其实|后来|当时|以前|现在|这|但|不过|可我|对于)/.test(trailing);
    const experience = /(?:这(?:曾经|以前|当时)|几(?:天|周|个月|年)前|以前|后来|当时|曾经|我(?:花了|折腾了|试了|终于|发现|做了)|曾经是我的|听上去像|分享给|做这件事)/.test(trailing);
    const resultOrShare = /(?:做了一个|分享|演示|教程|经验|复盘|记录|成功|效果|只(?:要|需).{0,12}(?:秒|分钟|小时)|花了.{0,12}(?:秒|分钟|小时))/.test(trailing);
    return selfAnswer || (experience && resultOrShare);
  }

  function looksLikeQuestion(text) {
    const source = clean(text);
    if (!source) return false;
    if (looksLikeMathQuestion(source)) return true;
    if (/[?？]/.test(source) && hasStoryAfterQuestion(source)) return false;
    if (hasExplicitAnswerRequest(source)) return true;

    const directQuestionStart = /^(?:为什么|怎么(?:样|办|做|用|算)?|如何|能不能|可不可以|是否|谁|哪里|哪儿|什么时候|多少|几|what\b|why\b|how\b|when\b|where\b|who\b)/i;
    if (!/[?？]/.test(source)) return directQuestionStart.test(source);

    const withoutClosingMarks = source.replace(/[”’"'）)\]】\s]+$/, "");
    if (/[?？]$/.test(withoutClosingMarks)) return true;
    return directQuestionStart.test(source) && source.length <= 80;
  }

  function shouldUseWebSearch(text) {
    const source = clean(text);
    if (!looksLikeQuestion(source) || looksLikeMathQuestion(source)) return false;
    return /(?:最新|现在|目前|今天|明天|昨天|今年|近期|刚刚|新闻|动态|更新|版本|价格|股价|汇率|天气|比赛|排名|政策|官网|地址|什么时候发布)/.test(source);
  }

  function classifyReplyContext(text) {
    const source = clean(text);
    const personalLoss = /(?:账号|号|内容|作品|数据|钱|订阅|会员|客户).{0,8}(?:没了|没|丢了|封了|挂了|被删|清空)|封号|号没了|号也没了/;
    const anger = /傻[逼b]|操蛋|妈的|垃圾|恶心|离谱|气死|拉黑|再见|滚|坑死|崩了|废物/;
    return personalLoss.test(source) && anger.test(source) ? "emotional-vent" : "ordinary";
  }

  function classify(text, settings = {}) {
    const source = clean(text);
    if (looksLikeQuestion(source)) return settings.questionAnswer === false ? "ignore" : "answer";
    if (looksLikeTerm(source)) return settings.termExplanation === false ? "ignore" : "explain";
    if (isMostlyEnglish(source)) return settings.termExplanation === false ? "ignore" : "translate";
    return settings.selectionReply === false ? "ignore" : "comment";
  }

  global.ZiliSelection = {
    classify,
    classifyReplyContext,
    isMostlyEnglish,
    isOwnedNode,
    isOwnedSelection,
    looksLikeTerm,
    looksLikeQuestion,
    looksLikeMathQuestion,
    shouldUseWebSearch
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
