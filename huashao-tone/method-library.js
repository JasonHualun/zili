(function initZiliMethodLibrary(global) {
  const CUSTOM_METHODS_KEY = "ziliMethodCardsV1";
  const MAX_CUSTOM_METHODS = 100;

  const clean = (value, max = 8000) => String(value || "").replace(/\r\n/g, "\n").trim().slice(0, max);
  const phraseList = value => (Array.isArray(value) ? value : String(value || "").split(/[\n,，]/))
    .map(item => clean(item, 160)).filter(Boolean).slice(0, 24);
  const words = value => [...new Set(phraseList(value))];
  const card = (id, name, category, summary, expert, beginner, prompt, excludes = []) => ({
    id, name, category, summary, expert: words(expert), beginner: words(beginner), prompt: clean(prompt), excludes: words(excludes), builtin: true
  });

  // Built-ins are packaged with the extension. They neither use Chrome storage nor enter a model request during matching.
  const BUILTINS = [
    card("architecture-advisor", "AI 系统架构顾问", "搭建与简化", "陪你把想法拆到可施工，每步选最轻的做法，分期搭到真的跑起来。",
      ["架构设计", "系统拆解", "工作流设计", "人机分工", "Agent 协作", "AI 架构", "自动化流程", "Loop 还是 Graph", "用脚本还是 Skill 还是 Agent"],
      ["我有个想法但不知道怎么开始", "这个功能要怎么设计", "怎么把这些东西串起来", "我脑子有点乱", "我不知道先做什么", "怕后面返工", "帮我搭一个工作流", "这个系统怎么搭", "做一个 Agent"],
      "你是陪我从想法走到“系统真的在跑”的 AI 架构师（搭档型总工）：一边设计，一边用没有编程经验也能懂的话讲清每个选择的理由，再陪我分期搭起来。请按顺序：\n0) 先问再拆：我已讲清的跳过，没讲清的一次最多问 3 个最影响结论的问题——最终产出什么（分两条：完成验收＝产出了什么；质量验收＝好到什么程度，用可检查的标准写）、频率和规模、有没有对外发布/发消息/扣费/写正式库/删除等不可逆动作、哪些环节必须我本人拍板、我手上已有哪些工具/脚本/Agent。同时找出“质量关键环节”：去掉后能交差、但质量会明显变差的环节。\n1) 定档并开头说明：轻（单步、一次性、无风险）→三五句方案直接做；中（2–5 步、要质检或定时）→一层施工单；重（多个子系统、跨天、有风险动作、多 Agent）→分层设计＋分期路线。\n2) 分层拆解：重档先拆成 3–7 个子系统，再拆到每道工序都能用一个具体手段完成、能单独测试；写清每两段之间的交接物、格式、存放位置、谁检查什么，优先落成文件或表格，不只存在对话里。\n3) 每道工序从轻到重，选能胜任的最轻手段：人工（要品味或拍板，或很少做）→脚本（规则固定、输入输出明确）→Skill（要 AI 判断、由人发起）→定时/常驻 Agent（要无人值守按时或按事件跑）→状态机 Graph（同时有分支回退、中途等人审批、要记住进度）→自愈循环 Loop（有客观对错标准，最多重试 3–5 次后停下叫人）。每升一档都说出上一档做不到的具体原因；文案、审美这类主观内容不让 AI 自评自改，改由我把关。\n4) 人机分工：AI 自主区、必须停下等我的品味闸门、没有我当次确认一律不执行的风险动作；AI 只负责理解、判断和生成，权限校验、写库、调外部接口交给确定的代码。\n5) 分期：第一期是“最小达标主线”——从输入到产出走通一条最短路，同时满足完成验收和质量验收，质量关键环节不能用占位代替；用真实输入试跑一次、给我看实际结果后才算完成；自动化放到最后，跑稳几次、规则不再变才挂成定时任务。\n中档以上交付施工单：目标与验收｜总图｜工序与选型（含大白话理由）｜交接表｜人机分工｜分期路线｜最大瓶颈｜未决问题。能写文件时把它存成 ARCHITECTURE.md 并记录进度，换对话从当前期接着做。设计先给我确认，我同意后再开始搭。不要默认推荐 Graph、多 Agent 或顶配模型，不要只堆框架名词，不用没有出处的数字说服我。\n\n我的想法：\n{draft}"),
    card("requirements-clarify", "需求澄清", "搭建与简化", "把“我想做个东西”问成可做、可验收的一件事。",
      ["需求澄清", "需求分析", "PRD", "验收标准", "范围定义"],
      ["我说不清楚", "你先问我几个问题", "我到底要做什么", "这个东西怎么定义", "我不知道要准备什么"],
      "先不要提出解决方案。请把我下面的想法澄清成：目标、谁在什么场景使用、最小范围、不做什么、成功标准和当前约束。每次只问一个最会改变方案的问题；已经能从我的文字确定的内容不要再问。最后给出一段我可以确认或修改的简明需求说明。\n\n我的想法：\n{draft}"),
    card("first-principles", "第一性原理", "搭建与简化", "摆脱惯例，回到目标、约束和不可省略的事实。",
      ["第一性原理", "基本假设", "约束拆解", "从本质出发"],
      ["为什么一定要这样做", "能不能别照别人那套", "我想从根上想清楚", "是不是把惯例当成必须了"],
      "请用第一性原理分析这件事：先区分事实、假设、惯例和偏好；再明确真正目标和不能突破的约束；把所有“必须这样做”逐项质疑；最后从基本条件重新组合出 1 到 3 条更简单的可验证路径。不要用名人语录或空泛鼓励。\n\n问题：\n{draft}"),
    card("musk-five-step", "马斯克五步工程法", "搭建与简化", "不降质量，把被 AI 过度搭建的项目缩到最小达标路径。",
      ["马斯克五步法", "五步法", "马斯克给意见", "质疑需求", "最小闭环", "别急着自动化", "删除流程", "合并重复", "改脚本"],
      ["AI 已经加了好多功能越来越复杂", "我不知道该删哪里", "要不要推倒重做", "一直优化还是不对", "先做简单一点", "现在要不要自动化", "越做越重", "帮我瘦身"],
      "请用马斯克五步工程法救援我这个越做越重的项目。目标是“做好”，不是“做完”：在项目仍能运行、成品质量不下降的前提下，找出最小达标路径。\n先做项目级判断，决定从哪一步进场，前面的步骤只用一句话确认：目标不清或没有验收→第一步；目标清楚但最小路径没真实跑过→第二步；跑过且有质量或耗时瓶颈证据→第三步（质量）或第四步（只是慢）；旧方案每条路都依赖已被证伪的前提→另起一个最小闭环，旧项目保留作参考，不清空。\n1) 质疑需求：写清当前目标、完成验收（产出什么）、质量验收（好到什么程度，用可检查的标准写）、质量关键节点（去掉会让质量验收失败、承载我的风格/经验/专业判断、或我说过要保留的环节），给出初始的最小达标路径。质疑的是没服务目标或质量的需求，不是质量要求本身。\n2) 先测基线再删：动任何东西前，用一个真实任务、固定输入，按现状原样跑一次留作基线。条件允许时再做一次开放式对照：只给目标、两条验收和合格的要求类材料（风格样本、写作架构、质量标准），不给现有流程，看不受约束会怎么做——它做得更好的环节说明现有流程在限制能力，现状更好的环节就是质量关键节点的证据；开跑前先告诉我规模，等我同意。然后列流程对照表（每个环节谁负责、读哪些规则、产出什么），逐项判一种处理：保留（标“完成必需”或“质量必需”）／合并（重复，或同一件事被拆到多处）／解冲突（同一件事两种规则，只留一个真源）／改脚本（输入来源固定、输出格式固定、判断规则写得出“如果…就…”，三条都满足才改；需要理解、判断好坏或体现风格的不改）／隔离候选（写明具体用途和重启条件）／删除（完成和质量都不需要、也没有未来用途证据）。质量关键节点不能靠推理删，只能列为“待对比”。\n3) 简化并同任务对比：把留下的每项减到满足两条验收的最低复杂度，用和基线相同的任务再跑一次，并排对照两条验收，质量结论由我来下；不差于基线才算瘦身成功，变差就逐项放回。达标就停，不为完整再加功能、角色、字段或规则。\n4)5) 加速和自动化默认“暂不”：最小闭环已跑通、有实际耗时证据才加速；稳定、高频、省下的时间大于维护成本才自动化，需要人判断的质量环节保留人工。\n红线：没写质量验收不删减；没有基线不动手；改、移、删之前先给我清单等我确认；改文件前先备份，整份文件只移入隔离区、不直接删除；没有前后同任务实测，不说瘦身成功；不因项目复杂就建议全部推倒。能写文件时把进度记在“五步法进度.md”，中断后接着做。\n按这个格式交付：当前目标｜完成验收｜质量验收｜质量关键节点｜进场判断｜真实阻塞点｜项目级决定（缩小/合并/局部修改/最小闭环重建）｜最小达标路径｜处理清单（项、处理、理由、重启条件）｜加速/自动化结论｜唯一的下一步。\n\n项目情况：\n{draft}"),
    card("occams-razor", "奥卡姆剃刀", "搭建与简化", "优先保留能完成目标的最少机制。",
      ["奥卡姆剃刀", "最少机制", "过度设计", "简化方案"],
      ["这个方案是不是太复杂", "能不能少做一点", "为什么要这么多工具", "先给我最简单能用的版本"],
      "请用奥卡姆剃刀审视下面的方案。先写清当前目标和验收；列出每个组件、规则或工具是否不可缺；删除或合并不能改变当前验收的部分；给出最简单可工作的版本，并说明哪些内容暂时不做。不要把“以后可能有用”当成保留理由。\n\n方案：\n{draft}"),
    card("cohesion-coupling", "高内聚，低耦合", "搭建与简化", "让每一块只负责一件事，减少彼此牵连。",
      ["高内聚低耦合", "模块边界", "解耦", "职责不清"],
      ["改一处全都跟着坏", "这些东西缠在一起", "每个 Agent 都在干重复的事", "怎么分工才不乱"],
      "请检查下面系统的边界。按模块或 Agent 列出：它唯一该负责什么、输入是什么、输出是什么、依赖谁；指出职责重叠、循环依赖和一改全改的地方；给出最少的拆分或合并建议。不要为了“架构漂亮”新增层级。\n\n当前系统：\n{draft}"),
    card("grill-me", "Grill me", "审查与验证", "通过一问一答找出方案真正漏掉的决定。",
      ["grill me", "压力测试方案", "拷问我的设计", "审视方案"],
      ["你来挑我的毛病", "帮我把坑找出来", "我怕没想全", "你问我几个关键问题", "别客气直接问"],
      "请作为严格但不羞辱人的方案审查者，和我一起压力测试下面的计划。每次只问一个最会改变结论的问题，并给出你推荐的答案或判断标准。优先检查目标、用户、范围、依赖、失败方式、验收和不可逆风险；能从材料中判断的不要问。等我回答后再问下一题。\n\n计划：\n{draft}"),
    card("adversarial-review", "对抗式审查", "审查与验证", "让没有参与实现的一方专门找证据、边界和反例。",
      ["对抗式审查", "Adversarial review", "反方审查", "prove it"],
      ["别只夸我", "请找反例", "这个方案哪里会失败", "帮我挑证据不够的地方"],
      "请作为未参与设计的反方审查者，审查下面的方案。不要复述优点；只列出会导致目标失败的假设、缺失证据、边界条件、反例和风险。每项写：为什么值得担心、需要什么证据验证、成本最低的验证动作。无法证伪的猜测要明确标为猜测。\n\n方案：\n{draft}"),
    card("ablation", "消融实验", "审查与验证", "去掉一个组件再跑，证明它是否真的有用。",
      ["消融实验", "Ablation", "组件有没有用", "去掉再跑"],
      ["这些规则到底有没有用", "我加了很多提示词不知道哪个有效", "去掉这个会怎样", "怎么证明这个 Agent 值得留"],
      "请为下面系统设计最小消融实验。先列出要验证的组件或规则及其宣称作用；每次只移除或替换一个变量；明确相同输入、衡量指标、成功/失败阈值和停止条件；优先设计成本最低、不会影响真实用户的实验。不要同时改多个东西。\n\n系统或规则：\n{draft}"),
    card("uncertainty-list", "列出所有不自信的点", "审查与验证", "把模糊的不安转成可验证任务。",
      ["不确定性清单", "风险清单", "未知点"],
      ["我有点不踏实", "哪些地方我没想清楚", "我不知道自己不知道什么", "把不确定的都列出来"],
      "请从下面材料中列出所有会改变结论的不确定点。每项写：未知的具体是什么、影响哪个决定、目前证据强弱、最快如何验证、验证前应采取什么保守动作。不要把一般性的“可能有风险”凑成清单；无法验证的主观偏好要单列。\n\n材料：\n{draft}"),
    card("critical-thinking", "批判性思维", "审查与验证", "分开事实、推断与说得很顺的故事。",
      ["批判性思维", "逻辑谬误", "证据链", "事实和观点"],
      ["这话听起来太顺了", "我感觉哪里不对但说不上来", "不要被话术带着走", "这是真的吗"],
      "请批判性地审查下面的说法：分别标出可核验事实、推断、价值判断和缺失前提；找出跳步、偷换概念、幸存者偏差或无法支持结论的证据；最后写出更准确、带条件的表述。不要为了反对而反对，没有问题也要说明证据边界。\n\n说法：\n{draft}"),
    card("five-whys", "五个为什么", "审查与验证", "从反复出现的表象追到可行动的根因。",
      ["五个为什么", "5 Whys", "根因分析", "根本原因"],
      ["为什么又出问题", "到底为什么会这样", "别只修表面", "这个问题老是重复"],
      "请用五个为什么做根因分析。先明确可观察的现象；每一层“为什么”只能依据已知事实或明确标为待验证假设；不要硬凑五层，找到可行动且有证据支持的根因即可。最后区分临时止血、根因修复和验证修复是否生效的指标。\n\n现象：\n{draft}"),
    card("premortem", "失败预演", "审查与验证", "先假设已失败，再倒推最可能的失误。",
      ["失败预演", "Premortem", "风险预演", "事前复盘"],
      ["我怕做了没用", "这个会不会翻车", "先想想最坏情况", "有什么坑"],
      "假设六周后这个计划已经失败。请从用户价值、执行、成本、依赖、质量和风险六个角度倒推最可能的失败原因；每项给出早期信号、预防动作和发生后的补救。按概率与影响排序，不要列无关的灾难电影式风险。\n\n计划：\n{draft}"),
    card("acceptance-criteria", "完成标准", "审查与验证", "把“做得好”变成可检查、可确认的验收。",
      ["验收标准", "完成定义", "Definition of Done", "测试标准"],
      ["做到什么算完成", "我怎么知道 AI 做对了", "别只说做完了", "怎么验收"],
      "请把下面目标写成可验收的完成标准。区分必须满足、可选加分和明确不做；每条都要能被人实际检查，写清输入、预期结果、边界情况和谁确认。避免“体验好”“足够智能”这类不可判断的话。\n\n目标：\n{draft}"),
    card("fable-explainer", "寓言讲解", "理解人与知识", "用精炼故事让抽象概念变得能感受到、能迁移。",
      ["寓言讲解", "寓言解释", "用故事解释", "隐喻讲解"],
      ["这个概念我听不懂", "别讲术语讲个故事", "能不能讲得像寓言", "给我一个有画面的例子"],
      "围绕 {concept} 写一则 1000 字以内的寓言，间接完整解释概念。正文不出现概念名或领域术语；角色不超过三个；用一个核心场景和一两次转折承载意义，不让角色当解说员。避免钟、河流、镜子、迷宫、地图、灯塔、棋盘、回声、影子、沙漏、风、蜡烛、种子、桥、星辰、蝴蝶、蛛网；避免旅行者求教智者、村庄异象顿悟、孩童点醒大人、师徒辩难、临终遗言，以及“从前有个地方”式开头。可优先用非人类视角或具体的现代职业和微观场景。\n\n输出顺序：先直接输出无标题的寓言正文；另起一段解释概念所属领域、核心定义和故事元素映射；最后提出两个具体问题，一个检验理解，一个检验迁移。\n\n概念或问题：\n{draft}"),
    card("jtbd", "JTBD 分析", "理解人与知识", "从“功能”回到用户在特定情境下想取得的进展。",
      ["JTBD", "Jobs to be Done", "用户任务", "用户进展"],
      ["这个东西到底帮谁", "别人为什么会用", "用户真正麻烦在哪里", "功能真的有人要吗", "现在他们用什么凑合"],
      "请用 JTBD 分析下面的产品或功能。不要先写用户画像或功能清单；先找用户在什么情境下遇到什么阻碍、想取得什么进展、当前用什么凑合；再分析推动他换方案的力量、拉住他的顾虑、替代方案与成功标准。最后写一个“当……时，我想要……，这样我就能……”的任务陈述，并指出最该验证的假设。\n\n产品想法：\n{draft}"),
    card("independent-thinking", "保持独立思考", "理解人与知识", "先形成自己的判断，再吸收外部观点。",
      ["独立思考", "形成自己的判断", "不要盲从", "观点校准"],
      ["别人都这么说但我不确定", "我不想被带着走", "先帮我自己想一遍", "这个观点到底站不站得住"],
      "请先基于我提供的事实独立形成一个暂定判断，不要急着引用权威或多数人的说法。写清判断依据、反对它的最好理由和哪些新证据会改变结论；然后再说明外部观点应该怎样被用来校准，而不是替代判断。\n\n问题：\n{draft}"),
    card("decision-matrix", "取舍矩阵", "理解人与知识", "把“哪个更好”变成有标准、有代价的选择。",
      ["取舍矩阵", "决策矩阵", "方案对比", "权衡利弊"],
      ["这几个方案怎么选", "我不知道哪个更好", "帮我权衡一下", "选 A 还是 B"],
      "请帮助我做取舍，而不是直接替我拍板。先确认目标和不可妥协条件；提出不超过五个有区分度的判断标准；逐项比较方案的收益、代价、风险和未知；明确哪些权重是我的价值选择；最后给出条件化建议，以及最小的补充信息或试验能否改变选择。\n\n待选方案：\n{draft}")
  ];

  const PLATFORM_RULES = [
    { label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
    { label: "Codex", hosts: ["codex.com", "codex.openai.com"] },
    { label: "Claude", hosts: ["claude.ai"] },
    { label: "Gemini", hosts: ["gemini.google.com"] },
    { label: "DeepSeek", hosts: ["chat.deepseek.com", "deepseek.com"] },
    { label: "通义千问", hosts: ["qianwen.com", "tongyi.com"] },
    { label: "Poe", hosts: ["poe.com"] }
  ];

  // These are deliberately small local signal combinations, not exact sentences.
  // Every inner group needs one hit, so a single vague word does not open a method card.
  const ROUTE_SIGNALS = {
    "architecture-advisor": [
      [["想法", "点子", "功能", "产品"], ["不知道", "不清楚", "不会", "没头绪", "很乱"], ["开始", "下手", "第一步", "怎么做", "设计", "搭"]]
    ],
    "requirements-clarify": [
      [["需求", "目标", "范围", "定义", "准备", "做什么"], ["不清楚", "说不清", "不知道", "不确定", "问"]]
    ],
    "first-principles": [
      [["为什么", "本质", "根上", "底层"], ["必须", "惯例", "别人", "照搬", "这样做"]]
    ],
    "musk-five-step": [
      [["自动化", "功能", "规则", "流程"], ["太多", "复杂", "重", "臃肿"], ["删", "减", "推倒", "重做", "简单"]]
    ],
    "occams-razor": [
      [["复杂", "太多", "工具多", "过度"], ["简单", "少做", "删", "最小"]]
    ],
    "cohesion-coupling": [
      [["缠在一起", "耦合", "职责重叠", "重复干"], ["分工", "拆", "解耦", "边界"]],
      [["改一处", "一改"], ["全", "都", "一起"], ["坏", "影响", "牵连"]]
    ],
    "grill-me": [
      [["挑毛病", "没想全", "拷问", "别客气", "找坑", "漏洞"]]
    ],
    "adversarial-review": [
      [["反例", "反方", "prove it", "证据不够"], ["失败", "不成立", "哪里", "找"]]
    ],
    "ablation": [
      [["提示词", "规则", "组件", "agent"], ["哪个有效", "有没有用", "去掉", "移除", "值不值得"]]
    ],
    "uncertainty-list": [
      [["不确定", "不踏实", "没想清", "不知道"], ["哪些", "什么", "风险", "疑点"]]
    ],
    "critical-thinking": [
      [["哪里不对", "太顺", "话术", "逻辑", "证据", "真假"], ["感觉", "可信吗", "带着走", "不对", "是不是"]]
    ],
    "five-whys": [
      [["总是", "重复", "又", "老"], ["为什么", "原因", "根因", "根本"]]
    ],
    "premortem": [
      [["翻车", "失败", "最坏", "风险"], ["会不会", "怎么防", "提前", "先想"]]
    ],
    "acceptance-criteria": [
      [["算完成", "做对", "验收", "标准", "测试"], ["怎么", "什么", "做到", "检查"]]
    ],
    "fable-explainer": [
      [["听不懂", "别讲术语", "讲故事", "寓言", "有画面"], ["概念", "解释", "讲", "理解"]]
    ],
    "jtbd": [
      [["用户", "别人", "客户"], ["麻烦", "痛点", "为什么用", "要什么", "进展", "卡在哪里", "换掉"]]
    ],
    "independent-thinking": [
      [["别人都", "大家都", "权威", "跟风"], ["不确定", "不想盲从", "自己想", "站不站得住"]]
    ],
    "decision-matrix": [
      [["怎么选", "权衡", "取舍", "比较"], ["方案", "哪个", "两个", "几个", "a", "b"]]
    ]
  };

  function localSignalMatch(source, methodId) {
    for (const pattern of ROUTE_SIGNALS[methodId] || []) {
      const hits = pattern.map(group => group.find(term => source.includes(term.toLowerCase()))).filter(Boolean);
      if (hits.length === pattern.length) return { score: 2 + pattern.length, matched: hits };
    }
    return null;
  }

  function platform(hostname) {
    const host = clean(hostname, 200).toLowerCase().replace(/^www\./, "");
    const rule = PLATFORM_RULES.find(item => item.hosts.some(candidate => host === candidate || host.endsWith(`.${candidate}`)));
    return rule ? { label: rule.label, hostname: host } : null;
  }

  function normalizeCustomCard(value = {}) {
    const name = clean(value.name, 80);
    const prompt = clean(value.prompt, 8000);
    if (!name || !prompt) return null;
    const id = /^custom-[a-z0-9-]{3,80}$/i.test(String(value.id || ""))
      ? String(value.id)
      : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      name,
      category: clean(value.category, 60) || "我的方法",
      summary: clean(value.summary, 280) || "自定义方法卡",
      expert: words(value.expert),
      beginner: words(value.beginner),
      excludes: words(value.excludes),
      prompt,
      builtin: false
    };
  }

  function normalizeCustomCards(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).map(normalizeCustomCard).filter(item => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, MAX_CUSTOM_METHODS);
  }

  function parseJsonObject(value) {
    const raw = clean(value, 12000)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first < 0 || last <= first) return null;
      try { parsed = JSON.parse(raw.slice(first, last + 1)); } catch { return null; }
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  }

  function parseIntakeResponse(value) {
    const parsed = parseJsonObject(value);
    if (!parsed) return null;
    if (parsed?.kind === "question") {
      const question = clean(parsed.question, 500);
      return question ? { kind: "question", question } : null;
    }
    if (parsed?.kind === "candidate") {
      const candidate = normalizeCustomCard(parsed.card);
      if (!candidate || (!candidate.expert.length && !candidate.beginner.length)) return null;
      return { kind: "candidate", card: candidate };
    }
    return null;
  }

  function methods(customCards) {
    return [...BUILTINS, ...normalizeCustomCards(customCards)];
  }

  // This is deliberately compact. The model sees method identities and what each
  // method is for, but not every full Prompt on every keystroke.
  function catalog(customCards) {
    return methods(customCards).map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      summary: item.summary,
      signals: [...item.expert.slice(0, 2), ...item.beginner.slice(0, 2)]
    }));
  }

  // 架构师给 2–3 张候选卡；第一张就是 method，picks 是全部候选（老格式单张也认）。
  function parseArchitectResponse(value, customCards) {
    const parsed = parseJsonObject(value);
    if (!parsed) return null;
    if (parsed.kind === "none") return { kind: "none" };
    // 架构师不反问用户：模型若仍想问，就改推「需求澄清」，让 Agent 去问。
    const raw = parsed.kind === "methods" && Array.isArray(parsed.picks) ? parsed.picks
      : parsed.kind === "method" ? [parsed]
      : parsed.kind === "question" ? [{ methodId: "requirements-clarify" }]
      : [];
    const all = methods(customCards);
    const picks = [];
    for (const item of raw) {
      const method = all.find(card => card.id === clean(item?.methodId, 120));
      if (!method || picks.some(pick => pick.method.id === method.id)) continue;
      picks.push({ method, reason: clean(item?.reason, 280) || `适合用「${method.name}」先把这件事想清楚` });
      if (picks.length === 3) break;
    }
    if (!picks.length) return null;
    return { kind: "method", method: picks[0].method, reason: picks[0].reason, picks, task: clean(parsed.task, 400) };
  }

  function recommend(text, options = {}) {
    const source = clean(text, 8000).toLowerCase();
    const currentPlatform = platform(options.hostname);
    if (!currentPlatform || source.length < 4) return null;
    const candidates = methods(options.customCards).map(item => {
      if (item.excludes.some(phrase => source.includes(phrase.toLowerCase()))) return null;
      const expertMatches = item.expert.filter(phrase => source.includes(phrase.toLowerCase()));
      const beginnerMatches = item.beginner.filter(phrase => source.includes(phrase.toLowerCase()));
      const localSignal = localSignalMatch(source, item.id);
      const score = expertMatches.length * 5 + beginnerMatches.length * 3 + (localSignal?.score || 0);
      if (score < 3) return null;
      return { ...item, score, matched: [...expertMatches, ...beginnerMatches, ...(localSignal?.matched || [])], platform: currentPlatform };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
    const selected = candidates[0];
    if (!selected) return null;
    return {
      ...selected,
      confidence: Math.min(0.98, 0.58 + selected.score * 0.06),
      reason: `识别到“${selected.matched.slice(0, 2).join("、")}”`
    };
  }

  function renderPrompt(method, draft) {
    if (!method) return "";
    const source = clean(draft, 8000);
    const concept = source.replace(/^.*?(?:概念|解释|理解)[:：]?/i, "").trim().slice(0, 160) || "这个概念";
    return clean(method.prompt.replaceAll("{draft}", source).replaceAll("{concept}", concept), 12000);
  }

  global.ZiliMethodLibrary = {
    BUILTINS,
    CUSTOM_METHODS_KEY,
    MAX_CUSTOM_METHODS,
    platform,
    methods,
    catalog,
    normalizeCustomCard,
    normalizeCustomCards,
    parseIntakeResponse,
    parseArchitectResponse,
    recommend,
    renderPrompt
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
