(function initZiliInteraction(global) {
  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function isVisibleRect(rect, viewportWidth, viewportHeight) {
    if (!rect) return false;
    const left = number(rect.left);
    const right = number(rect.right, left + number(rect.width));
    const top = number(rect.top);
    const bottom = number(rect.bottom, top + number(rect.height));
    const width = number(rect.width, right - left);
    const height = number(rect.height, bottom - top);
    return width > 0
      && height > 0
      && right > 0
      && bottom > 0
      && left < viewportWidth
      && top < viewportHeight;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function positionPanel(input = {}) {
    const viewportWidth = Math.max(0, number(input.viewportWidth));
    const viewportHeight = Math.max(0, number(input.viewportHeight));
    const panelWidth = Math.max(1, number(input.panelWidth, 376));
    const panelHeight = Math.max(1, number(input.panelHeight, 220));
    const margin = Math.max(0, number(input.margin, 16));
    const gap = Math.max(0, number(input.gap, 12));
    const rect = input.composerRect;

    if (!isVisibleRect(rect, viewportWidth, viewportHeight)) {
      return { placement: "viewport", left: margin, top: margin };
    }

    const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
    const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
    const rightSide = number(rect.right) + gap;
    const leftSide = number(rect.left) - panelWidth - gap;
    const left = rightSide + panelWidth <= viewportWidth - margin
      ? rightSide
      : leftSide >= margin
        ? leftSide
        : clamp(number(rect.left), margin, maxLeft);

    return {
      placement: "composer",
      left: Math.round(left),
      top: Math.round(clamp(number(rect.top), margin, maxTop))
    };
  }

  function normalizeDraft(value) {
    return String(value || "")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canRestoreRewrite(currentText, appliedText) {
    const applied = normalizeDraft(appliedText);
    return Boolean(applied && normalizeDraft(currentText) === applied);
  }

  function createRewriteGuard() {
    const records = new WeakMap();

    function recordFor(composer) {
      let record = records.get(composer);
      if (!record) {
        record = { skipped: new Set() };
        records.set(composer, record);
      }
      return record;
    }

    function recordApplied(composer, sourceText, outputText) {
      if (!composer) return;
      const record = recordFor(composer);
      for (const value of [sourceText, outputText]) {
        const normalized = normalizeDraft(value);
        if (normalized) record.skipped.add(normalized);
      }
    }

    // 字里写进去的内容（按标题写的正文、润色结果、对话里改的）记下来：
    // 用户在上面改几个字、点一下，都还算字里写的，不再自动润色一遍；整段删掉重写才重新算。
    function recordWritten(composer, text) {
      if (!composer) return;
      const normalized = normalizeDraft(text);
      if (normalized) recordFor(composer).written = normalized;
    }

    function mostlyWritten(written, current) {
      if (!written || !current) return false;
      const size = 8;
      const chunks = [];
      for (let i = 0; i + size <= written.length; i += size) chunks.push(written.slice(i, i + size));
      if (!chunks.length) return current.includes(written);
      const kept = chunks.filter(chunk => current.includes(chunk)).length;
      return kept / chunks.length >= 0.5;
    }

    function shouldSkip(composer, text) {
      if (!composer) return false;
      const normalized = normalizeDraft(text);
      const record = records.get(composer);
      if (!normalized || !record) return false;
      return record.skipped.has(normalized) || mostlyWritten(record.written, normalized);
    }

    function noteInput(composer, text, inputType = "") {
      if (!composer) return { skip: false, reason: "" };
      const normalized = normalizeDraft(text);
      if (/^delete/i.test(String(inputType || ""))) {
        if (normalized) recordFor(composer).skipped.add(normalized);
        return { skip: true, reason: "user-delete" };
      }
      return shouldSkip(composer, normalized)
        ? { skip: true, reason: "same-content" }
        : { skip: false, reason: "" };
    }

    return {
      noteInput,
      recordApplied,
      recordWritten,
      shouldSkip
    };
  }

  global.ZiliInteraction = {
    canRestoreRewrite,
    createRewriteGuard,
    isVisibleRect,
    positionPanel
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
