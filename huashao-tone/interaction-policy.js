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

    function shouldSkip(composer, text) {
      if (!composer) return false;
      const normalized = normalizeDraft(text);
      return Boolean(normalized && records.get(composer)?.skipped.has(normalized));
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
