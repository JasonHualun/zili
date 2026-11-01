(function initZiliRuntime(global) {
  function send(message, options = {}) {
    return new Promise(resolve => {
      let settled = false;
      const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
      let timer = null;
      const finish = response => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(response);
      };
      if (timeoutMs) {
        timer = setTimeout(() => {
          finish({ ok: false, error: "runtime_timeout" });
        }, timeoutMs);
      }
      try {
        chrome.runtime.sendMessage(message, response => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            finish({ ok: false, error: "message_port_closed" });
            return;
          }
          finish(response || { ok: false, error: "empty_response" });
        });
      } catch {
        finish({ ok: false, error: "runtime_unavailable" });
      }
    });
  }

  global.ZiliRuntime = { send };
})(typeof globalThis !== "undefined" ? globalThis : window);
