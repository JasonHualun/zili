(function initZiliPageCopy(global) {
  let active = false;
  let toolbar = null;
  let copyButton = null;
  let selectedText = "";
  let pressPoint = null;
  let imageBar = null;
  let imageBarButtons = null;
  let hoveredImage = "";
  let moveFrame = 0;
  const STYLE_ID = "zili-copy-mode-style";

  function isEditable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.('input, textarea, [contenteditable], #huashao-tone-root, #zili-companion-root, #zili-copy-toolbar'));
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  function ensureToolbar() {
    if (toolbar) return;
    toolbar = document.createElement("div");
    toolbar.id = "zili-copy-toolbar";
    toolbar.style.cssText = "all:initial;position:fixed;z-index:2147483647;display:none;";
    const shadow = toolbar.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = "button{padding:8px 12px;border:0;border-radius:9px;background:#233d53;color:white;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 5px 16px #0003;cursor:pointer}";
    copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制选中文字";
    copyButton.addEventListener("pointerdown", event => event.preventDefault());
    copyButton.addEventListener("click", async () => {
      if (!selectedText) return;
      try {
        await navigator.clipboard.writeText(selectedText);
        copyButton.textContent = `已复制 ${selectedText.length} 字`;
        setTimeout(() => { if (copyButton) copyButton.textContent = "复制选中文字"; }, 1500);
      } catch {
        copyButton.textContent = "复制失败，请重选文字";
      }
    });
    shadow.append(style, copyButton);
    document.documentElement.appendChild(toolbar);
  }

  function updateSelection() {
    if (!active) return;
    const selection = document.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || isEditable(selection.anchorNode) || isEditable(selection.focusNode)) {
      selectedText = "";
      hideToolbar();
      return;
    }
    selectedText = selection.toString().trim().slice(0, 20000);
    if (!selectedText) { hideToolbar(); return; }
    ensureToolbar();
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - 145, rect.left))}px`;
    toolbar.style.top = `${Math.max(8, rect.top > 45 ? rect.top - 40 : rect.bottom + 8)}px`;
    toolbar.style.display = "block";
  }

  // Images: sites often cover them with transparent layers or block the context menu, so in copy
  // mode we look through every layer under the pointer and offer copy / save on the image itself.
  function imageSourceAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest?.("#zili-image-toolbar, #zili-copy-toolbar, #huashao-tone-root, #zili-companion-root")) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 80) continue;
      if (el.tagName === "IMG" && el.currentSrc) return { src: el.currentSrc, rect };
      const background = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if (background?.[1] && !background[1].startsWith("data:image/svg")) return { src: new URL(background[1], location.href).href, rect };
    }
    return null;
  }

  function imageName(src, type) {
    const base = (/^(?:data|blob):/.test(src) ? "image" : src.split(/[?#]/)[0].split("/").pop() || "image").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "image";
    return `${base}.${(type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
  }

  async function fetchImage(src) {
    const response = await fetch(src, { credentials: "include" });
    if (!response.ok) throw new Error("fetch_failed");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not_image");
    return blob;
  }

  async function toPng(blob) {
    if (blob.type === "image/png") return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.convertToBlob({ type: "image/png" });
  }

  function flash(button, text) {
    const label = button.dataset.label;
    button.textContent = text;
    setTimeout(() => { button.textContent = label; }, 1600);
  }

  async function imageAction(kind, button) {
    const src = hoveredImage;
    if (!src) return;
    let blob;
    try {
      blob = await fetchImage(src);
    } catch {
      // The site refuses direct reads; the original image in its own tab can still be saved by hand.
      window.open(src, "_blank", "noopener");
      flash(button, "已在新标签打开");
      return;
    }
    if (kind === "copy") {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": await toPng(blob) })]);
        flash(button, "已复制");
      } catch {
        flash(button, "复制失败，点保存");
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = imageName(src, blob.type);
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    flash(button, "已保存");
  }

  function ensureImageBar() {
    if (imageBar) return;
    imageBar = document.createElement("div");
    imageBar.id = "zili-image-toolbar";
    imageBar.style.cssText = "all:initial;position:fixed;z-index:2147483647;display:none;";
    const shadow = imageBar.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = "div{display:flex;gap:4px;padding:4px;border-radius:11px;background:rgba(20,30,40,.78);backdrop-filter:blur(8px);box-shadow:0 6px 18px #0004}button{padding:6px 10px;border:0;border-radius:8px;background:transparent;color:#fff;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}button:hover{background:#ffffff26}";
    const row = document.createElement("div");
    imageBarButtons = [["copy", "复制图片"], ["save", "保存"]].map(([kind, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.label = label;
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => { event.stopPropagation(); void imageAction(kind, button); });
      row.append(button);
      return button;
    });
    shadow.append(style, row);
    document.documentElement.appendChild(imageBar);
  }

  function hideImageBar() {
    hoveredImage = "";
    if (imageBar) imageBar.style.display = "none";
  }

  function trackImage(event) {
    // composedPath is empty once dispatch ends, so check for the bar before deferring.
    if (!active || moveFrame || (imageBar && event.composedPath().includes(imageBar))) return;
    const { clientX, clientY } = event;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      const found = imageSourceAt(clientX, clientY);
      if (!found) { hideImageBar(); return; }
      ensureImageBar();
      hoveredImage = found.src;
      imageBar.style.left = `${Math.max(8, Math.min(window.innerWidth - 170, found.rect.right - 160))}px`;
      imageBar.style.top = `${Math.max(8, found.rect.top + 8)}px`;
      imageBar.style.display = "block";
    });
  }

  function setActive(next) {
    active = Boolean(next);
    if (active) {
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = 'html[data-zili-copy-mode] body :not(input):not(textarea):not([contenteditable]):not(#huashao-tone-root):not(#zili-companion-root):not(#zili-copy-toolbar){user-select:text!important;-webkit-user-select:text!important;-webkit-user-drag:none!important}';
        document.documentElement.appendChild(style);
      }
      document.documentElement.setAttribute("data-zili-copy-mode", "");
      global.dispatchEvent(new Event("zili-copy-mode-start"));
      updateSelection();
    } else {
      document.documentElement.removeAttribute("data-zili-copy-mode");
      document.getElementById(STYLE_ID)?.remove();
      selectedText = "";
      hideToolbar();
      hideImageBar();
    }
    return { ok: true, active };
  }

  // Links normally drag instead of selecting, and the mouseup opens them. In copy mode a press
  // that moved or left a selection is treated as selecting text, so the link stays put.
  document.addEventListener("dragstart", event => {
    if (active && !isEditable(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("pointerdown", event => {
    pressPoint = active && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  }, true);
  document.addEventListener("click", event => {
    if (!active || !pressPoint || isEditable(event.target)) return;
    const moved = Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) > 4;
    const selected = !document.getSelection()?.isCollapsed;
    pressPoint = null;
    if (moved || selected) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("selectionchange", updateSelection, true);
  document.addEventListener("pointermove", trackImage, { capture: true, passive: true });
  // Let the browser's own right-click menu (copy image / save image) through when a site blocks it.
  document.addEventListener("contextmenu", event => {
    if (active) event.stopImmediatePropagation();
  }, true);
  document.addEventListener("selectstart", event => {
    if (active && !isEditable(event.target)) event.stopImmediatePropagation();
  }, true);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SETTINGS_UPDATED" && message.settings?.enabled === false) {
      setActive(false);
      return false;
    }
    if (message?.type === "ZILI_COPY_MODE_STATUS") {
      sendResponse({ ok: true, active });
      return false;
    }
    if (message?.type === "ZILI_COPY_MODE_SET") {
      sendResponse(setActive(message.active));
      return false;
    }
    return false;
  });
  global.ZiliPageCopy = { isActive: () => active, setActive };
})(typeof globalThis !== "undefined" ? globalThis : window);
