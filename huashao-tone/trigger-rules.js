(function initZiliTriggerRules(global) {
  const STORAGE_KEY = "ziliTriggerRepliesV1";
  const MAX_RULES = 50;
  const MAX_TRIGGER_LENGTH = 160;
  const MAX_REPLY_LENGTH = 1200;

  function clean(value, maxLength) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function comparable(value) {
    return clean(value, MAX_REPLY_LENGTH).toLocaleLowerCase("zh-CN");
  }

  function normalizeRule(rule = {}, index = 0) {
    const trigger = clean(rule.trigger, MAX_TRIGGER_LENGTH);
    const reply = clean(rule.reply, MAX_REPLY_LENGTH);
    if (!trigger || !reply) return null;
    const fallbackId = `rule-${index + 1}`;
    return {
      id: clean(rule.id, 96) || fallbackId,
      trigger,
      reply,
      enabled: rule.enabled !== false
    };
  }

  function normalizeConfig(value = {}) {
    const rules = (Array.isArray(value.rules) ? value.rules : [])
      .slice(0, MAX_RULES)
      .map(normalizeRule)
      .filter(Boolean);
    return {
      enabled: value.enabled === true,
      rules
    };
  }

  function match(text, value = {}) {
    const config = normalizeConfig(value);
    if (!config.enabled) return null;
    const source = comparable(text);
    if (!source) return null;
    const matches = config.rules
      .filter(rule => rule.enabled && source.includes(comparable(rule.trigger)))
      .sort((left, right) => comparable(right.trigger).length - comparable(left.trigger).length);
    return matches[0] || null;
  }

  global.ZiliTriggerRules = {
    STORAGE_KEY,
    MAX_RULES,
    normalizeConfig,
    normalizeRule,
    match
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
