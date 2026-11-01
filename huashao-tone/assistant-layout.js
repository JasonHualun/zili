(function initZiliAssistantLayout(global) {
  const VIEWPORT_GAP = 8;
  const TAIL_INSET = 24;
  const ANCHOR_OVERLAP = 18;

  function overflowScore(candidate, viewportWidth, viewportHeight, cardWidth, cardHeight) {
    const right = candidate.left + cardWidth;
    const bottom = candidate.top + cardHeight;
    return Math.max(0, VIEWPORT_GAP - candidate.left)
      + Math.max(0, VIEWPORT_GAP - candidate.top)
      + Math.max(0, right - (viewportWidth - VIEWPORT_GAP))
      + Math.max(0, bottom - (viewportHeight - VIEWPORT_GAP));
  }

  function positionCard({
    anchorRect,
    viewportWidth,
    viewportHeight,
    cardWidth,
    cardHeight
  } = {}) {
    const anchor = anchorRect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const width = Math.max(1, Number(cardWidth) || 1);
    const height = Math.max(1, Number(cardHeight) || 1);
    const viewportW = Math.max(width + VIEWPORT_GAP * 2, Number(viewportWidth) || width);
    const viewportH = Math.max(height + VIEWPORT_GAP * 2, Number(viewportHeight) || height);
    const anchorWidth = Number(anchor.width) || Math.max(0, Number(anchor.right) - Number(anchor.left));
    const centerX = Number(anchor.left) + anchorWidth / 2;

    const candidates = [
      {
        placement: "above-left",
        tail: "bottom-right",
        left: centerX - width + TAIL_INSET,
        top: Number(anchor.top) - height + ANCHOR_OVERLAP
      },
      {
        placement: "above-right",
        tail: "bottom-left",
        left: centerX - TAIL_INSET,
        top: Number(anchor.top) - height + ANCHOR_OVERLAP
      },
      {
        placement: "below-left",
        tail: "top-right",
        left: centerX - width + TAIL_INSET,
        top: Number(anchor.bottom) - ANCHOR_OVERLAP
      },
      {
        placement: "below-right",
        tail: "top-left",
        left: centerX - TAIL_INSET,
        top: Number(anchor.bottom) - ANCHOR_OVERLAP
      }
    ];

    candidates.sort((a, b) => (
      overflowScore(a, viewportW, viewportH, width, height)
      - overflowScore(b, viewportW, viewportH, width, height)
    ));
    const best = candidates[0];
    return {
      placement: best.placement,
      tail: best.tail,
      left: Math.round(Math.max(VIEWPORT_GAP, Math.min(best.left, viewportW - width - VIEWPORT_GAP))),
      top: Math.round(Math.max(VIEWPORT_GAP, Math.min(best.top, viewportH - height - VIEWPORT_GAP)))
    };
  }

  global.ZiliAssistantLayout = { positionCard };
})(typeof globalThis !== "undefined" ? globalThis : window);
