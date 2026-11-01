(function initZiliScreenshot(global) {
  const MIN_REGION_SIZE = 12;
  const MAX_OUTPUT_EDGE = 1800;
  const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function cropPlan(rect = {}, viewport = {}, image = {}) {
    const viewportWidth = finite(viewport.width);
    const viewportHeight = finite(viewport.height);
    const imageWidth = finite(image.width);
    const imageHeight = finite(image.height);
    if (!viewportWidth || !viewportHeight || !imageWidth || !imageHeight) return null;

    const x = Math.max(0, Math.min(viewportWidth, finite(rect.x)));
    const y = Math.max(0, Math.min(viewportHeight, finite(rect.y)));
    const width = Math.max(0, Math.min(finite(rect.width), viewportWidth - x));
    const height = Math.max(0, Math.min(finite(rect.height), viewportHeight - y));
    if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null;

    const scaleX = imageWidth / viewportWidth;
    const scaleY = imageHeight / viewportHeight;
    const sx = Math.round(x * scaleX);
    const sy = Math.round(y * scaleY);
    const sourceWidth = Math.max(1, Math.round(width * scaleX));
    const sourceHeight = Math.max(1, Math.round(height * scaleY));
    const outputScale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(sourceWidth, sourceHeight));

    return {
      sx,
      sy,
      sourceWidth,
      sourceHeight,
      outputWidth: Math.max(1, Math.round(sourceWidth * outputScale)),
      outputHeight: Math.max(1, Math.round(sourceHeight * outputScale))
    };
  }

  function isImageDataUrl(value) {
    return IMAGE_DATA_URL.test(String(value || "").trim());
  }

  function resizePlan(width, height, maxEdge = MAX_OUTPUT_EDGE) {
    const sourceWidth = finite(width);
    const sourceHeight = finite(height);
    const edgeLimit = Math.max(1, finite(maxEdge, MAX_OUTPUT_EDGE));
    if (!sourceWidth || !sourceHeight) return null;
    const scale = Math.min(1, edgeLimit / Math.max(sourceWidth, sourceHeight));
    return {
      outputWidth: Math.max(1, Math.round(sourceWidth * scale)),
      outputHeight: Math.max(1, Math.round(sourceHeight * scale)),
      resized: scale < 1
    };
  }

  global.ZiliScreenshot = Object.freeze({
    MIN_REGION_SIZE,
    MAX_OUTPUT_EDGE,
    cropPlan,
    isImageDataUrl,
    resizePlan
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
