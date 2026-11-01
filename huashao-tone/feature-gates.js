(function initZiliFeatureGates(global) {
  function normalized(settings = {}) {
    return global.ToneOptimizer?.normalizeSettings
      ? global.ToneOptimizer.normalizeSettings(settings)
      : settings;
  }

  function isMasterEnabled(settings = {}) {
    return normalized(settings).enabled !== false;
  }

  function allowsRewrite(settings = {}) {
    const current = normalized(settings);
    return current.enabled !== false && current.autoRewrite !== false;
  }

  function allowsManualRewrite(settings = {}) {
    return isMasterEnabled(settings);
  }

  function allowsHighlight(settings = {}) {
    const current = normalized(settings);
    return current.enabled !== false && current.selectionComments !== false;
  }

  function allowsSelectionMode(settings = {}, mode = "comment") {
    const current = normalized(settings);
    if (current.enabled === false || current.selectionComments === false) return false;
    if (mode === "translate" || mode === "explain") return current.termExplanation !== false;
    if (mode === "answer") return current.questionAnswer !== false;
    if (mode === "comment") return current.selectionReply !== false;
    if (mode === "verify") return true;
    if (mode === "english") return true;
    return false;
  }

  global.ZiliFeatureGates = {
    isMasterEnabled,
    allowsRewrite,
    allowsManualRewrite,
    allowsHighlight,
    allowsSelectionMode
  };
})(globalThis);
