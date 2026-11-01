(function initZiliKeyGuard(global) {
  // Sites such as X listen for keys on the whole page (hotkeys), so Enter typed into our panels can
  // be swallowed before it arrives. Loaded at document_start, this runs ahead of the page: keys
  // typed inside our closed shadow roots are hidden from the page and re-dispatched to the focused
  // field inside the panel, whose own handlers then run as normal.
  const roots = new Map();

  // 输入法按回车是在确认候选词（比如把英文上屏），不是发送。有的输入法会先结束组字再发 keydown，
  // 所以组字结束后的一小段时间内的回车也算输入法的。
  let composingUntil = 0;
  global.addEventListener("compositionstart", () => { composingUntil = Infinity; }, true);
  global.addEventListener("compositionend", () => { composingUntil = Date.now() + 120; }, true);
  function isImeKey(event) {
    return event.isComposing || event.keyCode === 229 || Date.now() < composingUntil;
  }

  function forward(event) {
    if (!event.isTrusted || !roots.size || isImeKey(event)) return;
    const host = event.composedPath().find(node => roots.has(node));
    if (!host) return;
    event.stopImmediatePropagation();
    const target = roots.get(host).activeElement;
    if (!target) return;
    const copy = new KeyboardEvent(event.type, {
      key: event.key, code: event.code, location: event.location, repeat: event.repeat,
      isComposing: event.isComposing, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey,
      altKey: event.altKey, metaKey: event.metaKey, bubbles: true, cancelable: true
    });
    target.dispatchEvent(copy);
    if (copy.defaultPrevented) event.preventDefault();
  }

  for (const type of ["keydown", "keypress", "keyup"]) global.addEventListener(type, forward, true);
  global.ZiliKeyGuard = { register: (host, root) => roots.set(host, root), isImeKey };
})(typeof globalThis !== "undefined" ? globalThis : window);
