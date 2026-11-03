(function (global) {
  // One-shot cleanup of the page currently on screen: hide ads (local rules, no model)
  // or hide feed cards the model judges irrelevant. Refreshing the page undoes everything.
  const KNOWN_CARDS = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-compact-video-renderer", "ytd-grid-video-renderer",
    "ytd-reel-item-renderer", "ytm-shorts-lockup-view-model", "section.note-item", ".bili-video-card", ".feed-card",
    ".floor-single-card", ".bili-live-card", "article"
  ].join(",");
  const AD_SELECTORS = [
    "ytd-ad-slot-renderer", "ytd-in-feed-ad-layout-renderer", "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer", "ytd-display-ad-renderer", "ytd-banner-promo-renderer", "#masthead-ad",
    "ytd-companion-slot-renderer", "ytd-action-companion-ad-renderer", "ytd-statement-banner-renderer",
    "ins.adsbygoogle", "iframe[src*='doubleclick']", "iframe[id^='google_ads']", "div[id^='div-gpt-ad']",
    "[data-ad-slot]", "[aria-label='Sponsored']", "[aria-label='广告']"
  ].join(",");
  const AD_LABELS = new Set(["广告", "推广", "赞助", "赞助内容", "Ad", "Ads", "Sponsored", "Promoted"]);
  const OWN_HOSTS = "#huashao-tone-root, [id^='zili-'], [id^='huashao-']";
  const BATCH_SIZE = 60;
  const WATCH_IDLE_MS = 1200;
  // 脱水后继续盯着这一页：往下滑新加载出来的卡片也按同一句话筛。判过的卡记在 judged 里，不重复花钱。
  const watch = { instruction: "", href: "", observer: null, timer: 0, running: false, judged: new WeakSet() };

  function visible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 40 && getComputedStyle(el).visibility !== "hidden";
  }

  function signature(el) {
    return `${el.tagName}.${[...el.classList].sort().join(".")}`;
  }

  // Lowest ancestor that is repeated at least three times among its siblings: a feed card.
  function repeatedAncestor(start) {
    for (let el = start; el && el !== document.body; el = el.parentElement) {
      const parent = el.parentElement;
      if (!parent || !visible(el)) continue;
      const sig = signature(el);
      let same = 0;
      for (const sibling of parent.children) if (signature(sibling) === sig && ++same >= 3) return el;
    }
    return null;
  }

  function cleanText(el) {
    return String(el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function collectCards() {
    const cards = new Set([...document.querySelectorAll(KNOWN_CARDS)].filter(visible));
    // 信息流里常混着别的样式的卡（B 站的番剧、国创、直播）：和已知卡片同在一个网格里的兄弟也算。
    const grids = new Map();
    for (const card of cards) grids.set(card.parentElement, (grids.get(card.parentElement) || 0) + 1);
    for (const [grid, count] of grids) {
      if (!grid || count < 3) continue;
      for (const sibling of grid.children) if (visible(sibling)) cards.add(sibling);
    }
    if (cards.size < 3) {
      for (const link of document.querySelectorAll("a[href]")) {
        if (cleanText(link).length < 6 || link.closest(OWN_HOSTS)) continue;
        const card = repeatedAncestor(link);
        if (card) cards.add(card);
      }
    }
    // Keep only outermost cards so a hidden card never contains another candidate.
    return [...cards].filter(card => ![...cards].some(other => other !== card && other.contains(card)))
      .filter(card => !card.closest(OWN_HOSTS) && !card.dataset.ziliHidden && cleanText(card).length >= 4);
  }

  function hide(el, reason) {
    if (el.dataset.ziliHidden) return false;
    el.dataset.ziliHidden = reason;
    el.dataset.ziliPrevDisplay = el.style.getPropertyValue("display");
    el.style.setProperty("display", "none", "important");
    return true;
  }

  function stopWatching() {
    watch.observer?.disconnect();
    clearTimeout(watch.timer);
    Object.assign(watch, { instruction: "", href: "", observer: null, timer: 0, judged: new WeakSet() });
  }

  function restore() {
    stopWatching();
    let count = 0;
    for (const el of document.querySelectorAll("[data-zili-hidden]")) {
      const previous = el.dataset.ziliPrevDisplay;
      if (previous) el.style.setProperty("display", previous);
      else el.style.removeProperty("display");
      delete el.dataset.ziliHidden;
      delete el.dataset.ziliPrevDisplay;
      count += 1;
    }
    return { ok: true, restored: count };
  }

  function cleanAds() {
    let hidden = 0;
    for (const ad of document.querySelectorAll(AD_SELECTORS)) {
      if (ad.closest(OWN_HOSTS)) continue;
      const target = ad.closest(KNOWN_CARDS) || ad;
      if (hide(target, "ad")) hidden += 1;
    }
    for (const card of collectCards()) {
      const labelled = [...card.querySelectorAll("span, div, p, small, a, badge-shape")]
        .some(node => node.childElementCount === 0 && AD_LABELS.has(node.textContent.trim()));
      if (labelled && hide(card, "ad")) hidden += 1;
    }
    return { ok: true, hidden };
  }

  async function judgeCards(text, cards, send) {
    let hidden = 0;
    for (let start = 0; start < cards.length; start += BATCH_SIZE) {
      const batch = cards.slice(start, start + BATCH_SIZE);
      const response = await send({
        type: "ZILI_PAGE_FILTER",
        instruction: text,
        items: batch.map((card, index) => ({ i: index, t: cleanText(card) }))
      });
      if (!response?.ok) return { ok: false, error: response?.error || "模型判断失败", hidden };
      batch.forEach(card => watch.judged.add(card));
      for (const index of response.hide) if (batch[index] && hide(batch[index], "filter")) hidden += 1;
    }
    return { ok: true, hidden, total: cards.length };
  }

  async function judgeNewCards(send) {
    // 换了页面（单页应用里点进别的页）就不再按旧指令筛。
    if (!watch.instruction || location.href !== watch.href) return stopWatching();
    if (watch.running) return scheduleWatch(send);
    const fresh = collectCards().filter(card => !watch.judged.has(card));
    if (!fresh.length) return;
    watch.running = true;
    try {
      await judgeCards(watch.instruction, fresh, send);
    } finally {
      watch.running = false;
    }
  }

  function scheduleWatch(send) {
    clearTimeout(watch.timer);
    watch.timer = setTimeout(() => void judgeNewCards(send), WATCH_IDLE_MS);
  }

  function startWatching(text, send) {
    watch.observer?.disconnect();
    watch.instruction = text;
    watch.href = location.href;
    watch.observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.addedNodes.length && !m.target.closest?.(OWN_HOSTS))) scheduleWatch(send);
    });
    watch.observer.observe(document.body, { childList: true, subtree: true });
  }

  async function filterByInstruction(instruction, send) {
    const text = String(instruction || "").trim().slice(0, 200);
    if (!text) return { ok: false, error: "请说要留下或去掉什么" };
    stopWatching();
    const cards = collectCards();
    if (!cards.length) return { ok: false, error: "这一页没有找到可判断的内容" };
    const result = await judgeCards(text, cards, send);
    if (result.ok) startWatching(text, send);
    return result;
  }

  function status() {
    return {
      ok: true,
      ads: document.querySelectorAll("[data-zili-hidden='ad']").length,
      filtered: document.querySelectorAll("[data-zili-hidden='filter']").length,
      watching: Boolean(watch.instruction)
    };
  }

  const send = message => global.ZiliRuntime.send(message, { timeoutMs: 45000 });
  const api = {
    cleanAds,
    restore,
    status,
    filter: instruction => filterByInstruction(instruction, send),
    collectCards
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ZILI_PAGE_CLEAN_STATUS") { sendResponse(status()); return false; }
    if (message?.type === "ZILI_PAGE_CLEAN_ADS") { sendResponse(cleanAds()); return false; }
    if (message?.type === "ZILI_PAGE_RESTORE") { sendResponse(restore()); return false; }
    if (message?.type === "ZILI_PAGE_FILTER_RUN") {
      api.filter(message.instruction).then(sendResponse);
      return true;
    }
    return false;
  });
  global.ZiliPageFilter = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
