/**
 * Map the on-screen OCR guide frame to a crop rect on the captured photo.
 * Assumes the camera preview uses center-crop (cover) inside the view.
 */

export function normalizeOcrSkuText(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9-]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * @param {{ width: number, height: number }} viewSize Preview box in px
 * @param {{ left: number, top: number, width: number, height: number }} frame Guide rect in view px
 * @param {{ width: number, height: number }} photoSize Captured image size
 */
export function photoCropRectForGuideFrame(viewSize, frame, photoSize) {
  const viewW = Math.max(1, Number(viewSize.width) || 1);
  const viewH = Math.max(1, Number(viewSize.height) || 1);
  const photoW = Math.max(1, Number(photoSize.width) || 1);
  const photoH = Math.max(1, Number(photoSize.height) || 1);

  const viewAspect = viewW / viewH;
  const photoAspect = photoW / photoH;

  let scale;
  let offsetX = 0;
  let offsetY = 0;

  if (photoAspect > viewAspect) {
    scale = photoH / viewH;
    offsetX = (photoW - viewW * scale) / 2;
  } else {
    scale = photoW / viewW;
    offsetY = (photoH - viewH * scale) / 2;
  }

  const originX = Math.round(offsetX + frame.left * scale);
  const originY = Math.round(offsetY + frame.top * scale);
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);

  const clampedX = Math.max(0, Math.min(originX, photoW - 1));
  const clampedY = Math.max(0, Math.min(originY, photoH - 1));
  const clampedW = Math.max(1, Math.min(width, photoW - clampedX));
  const clampedH = Math.max(1, Math.min(height, photoH - clampedY));

  return {
    originX: clampedX,
    originY: clampedY,
    width: clampedW,
    height: clampedH,
  };
}
