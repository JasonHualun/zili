(function initZiliWriteback(global) {
  function dispatchValueChange(element, options) {
    if (typeof element?.dispatchEvent !== "function") return;
    const EventCtor = options.Event || global.Event;
    const event = typeof EventCtor === "function"
      ? new EventCtor("input", { bubbles: true, composed: true })
      : { type: "input", bubbles: true, composed: true };
    element.dispatchEvent(event);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u200b/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function currentText(element) {
    const value = "value" in Object(element) ? element.value : element?.innerText || element?.textContent;
    return normalizeText(value);
  }

  function lastTextNode(root) {
    const children = Array.from(root?.childNodes || []);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child?.nodeType === 3 && String(child.nodeValue ?? child.textContent ?? "").length > 0) {
        return child;
      }
      const nested = lastTextNode(child);
      if (nested) return nested;
    }
    return null;
  }

  function restoreCaret(element, options = {}) {
    if (!element) return false;
    const documentAdapter = options.document || global.document;
    const windowAdapter = options.window || global.window;
    const InputCtor = options.HTMLInputElement || global.HTMLInputElement;
    const TextAreaCtor = options.HTMLTextAreaElement || global.HTMLTextAreaElement;
    const isInput = typeof InputCtor === "function" && element instanceof InputCtor;
    const isTextArea = typeof TextAreaCtor === "function" && element instanceof TextAreaCtor;

    element.focus?.();
    if (isInput || isTextArea) {
      const end = String(element.value || "").length;
      element.setSelectionRange?.(end, end);
      return true;
    }

    const selection = windowAdapter?.getSelection?.();
    const range = documentAdapter?.createRange?.();
    if (!selection || !range || typeof range.collapse !== "function") return false;
    const textNode = lastTextNode(element);
    if (textNode && typeof range.setStart === "function") {
      const offset = String(textNode.nodeValue ?? textNode.textContent ?? "").length;
      range.setStart(textNode, offset);
      range.collapse(true);
    } else {
      range.selectNodeContents(element);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  // X 这类受控编辑器自己记着选区，只认 selectionchange 之后同步的那份。只改 DOM 选区就粘贴，
  // 它会把结果插在旧光标处、原文还留着。所以全选后立刻补发 selectionchange / select 让它先同步。
  function selectAllContents(element, options = {}) {
    const documentAdapter = options.document || global.document;
    const windowAdapter = options.window || global.window;
    const selection = windowAdapter?.getSelection?.();
    const range = documentAdapter?.createRange?.();
    if (!selection || !range) return;
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    const EventCtor = options.Event || global.Event;
    if (typeof EventCtor !== "function") return;
    documentAdapter?.dispatchEvent?.(new EventCtor("selectionchange"));
    element.dispatchEvent?.(new EventCtor("select", { bubbles: true }));
  }

  // 写入后原文还在、结果只是被插进去了（输入框里比结果多出一截）。
  function hasLeftover(value, expectedText) {
    const current = normalizeText(value);
    const expected = normalizeText(expectedText);
    return Boolean(expected) && current !== expected && current.length > expected.length && current.includes(expected);
  }

  function isExactRepeat(value, expectedText) {
    const current = normalizeText(value);
    const expected = normalizeText(expectedText);
    if (!expected) return false;
    return current === `${expected}${expected}`
      || current === `${expected}\n${expected}`
      || current === `${expected}\n\n${expected}`;
  }

  function dispatchEditorPaste(element, text, options = {}) {
    if (typeof element?.dispatchEvent !== "function") return false;
    const DataTransferCtor = options.DataTransfer || global.DataTransfer;
    const ClipboardEventCtor = options.ClipboardEvent || global.ClipboardEvent;
    if (typeof DataTransferCtor !== "function" || typeof ClipboardEventCtor !== "function") return false;
    try {
      const clipboardData = new DataTransferCtor();
      clipboardData.setData("text/plain", text);
      const event = new ClipboardEventCtor("paste", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData
      });
      element.dispatchEvent(event);
      // Controlled editors such as X/React may accept the paste now but only
      // commit their DOM on the next microtask. `defaultPrevented` is the
      // synchronous ownership signal; checking DOM text here would falsely
      // trigger a second writer and corrupt the editor state.
      return Boolean(event.defaultPrevented);
    } catch (_) {
      return false;
    }
  }

  function reconcile(element, text, options = {}) {
    if (!element) return { ok: false, method: "missing" };
    const targetText = normalizeText(text);
    const observed = currentText(element);
    if (observed === targetText) return { ok: true, method: "unchanged" };
    const leftover = !isExactRepeat(observed, targetText) && hasLeftover(observed, targetText);
    if (!leftover && !isExactRepeat(observed, targetText)) return { ok: false, method: "different" };

    const InputCtor = options.HTMLInputElement || global.HTMLInputElement;
    const TextAreaCtor = options.HTMLTextAreaElement || global.HTMLTextAreaElement;
    const isInput = typeof InputCtor === "function" && element instanceof InputCtor;
    const isTextArea = typeof TextAreaCtor === "function" && element instanceof TextAreaCtor;
    if (isInput || isTextArea) {
      const prototype = isInput ? InputCtor.prototype : TextAreaCtor.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, targetText);
      else element.value = targetText;
      dispatchValueChange(element, options);
      restoreCaret(element, options);
      return { ok: true, method: "reconciled" };
    }

    const documentAdapter = options.document || global.document;
    element.focus?.();
    selectAllContents(element, options);
    if (leftover && typeof (options.setTimeout || global.setTimeout) === "function") {
      // 编辑器刚吃过一次粘贴，等它把新选区同步完再整段覆盖。
      (options.setTimeout || global.setTimeout)(() => {
        if (!hasLeftover(currentText(element), targetText)) return;
        element.focus?.();
        selectAllContents(element, options);
        if (!dispatchEditorPaste(element, targetText, options)) documentAdapter?.execCommand?.("insertText", false, targetText);
      }, 60);
      return { ok: true, method: "reconciled" };
    }

    if (dispatchEditorPaste(element, targetText, options)) {
      return { ok: true, method: "reconciled" };
    }

    const inserted = documentAdapter?.execCommand?.("insertText", false, targetText);
    if (inserted) return { ok: true, method: "reconciled" };

    element.textContent = targetText;
    dispatchValueChange(element, options);
    restoreCaret(element, options);
    return { ok: true, method: "reconciled" };
  }

  function replace(element, text, options = {}) {
    if (!element) return { ok: false, method: "missing" };
    const targetText = normalizeText(text);
    if (!options.force && currentText(element) === targetText) {
      return { ok: true, method: "deduplicated" };
    }

    const documentAdapter = options.document || global.document;
    const windowAdapter = options.window || global.window;
    const InputCtor = options.HTMLInputElement || global.HTMLInputElement;
    const TextAreaCtor = options.HTMLTextAreaElement || global.HTMLTextAreaElement;
    const isInput = typeof InputCtor === "function" && element instanceof InputCtor;
    const isTextArea = typeof TextAreaCtor === "function" && element instanceof TextAreaCtor;

    element.focus?.();

    if (isInput || isTextArea) {
      const prototype = isInput ? InputCtor.prototype : TextAreaCtor.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, targetText);
      else element.value = targetText;
      dispatchValueChange(element, options);
      restoreCaret(element, options);
      return { ok: true, method: "value" };
    }

    selectAllContents(element, options);

    if (dispatchEditorPaste(element, targetText, options)) {
      return { ok: true, method: "paste" };
    }

    const inserted = documentAdapter?.execCommand?.("insertText", false, targetText);
    if (inserted) {
      return { ok: true, method: "execCommand" };
    }

    element.textContent = targetText;
    dispatchValueChange(element, options);
    restoreCaret(element, options);
    return { ok: true, method: "textContent" };
  }

  global.ZiliWriteback = { isExactRepeat, reconcile, replace, restoreCaret };
})(typeof globalThis !== "undefined" ? globalThis : window);
