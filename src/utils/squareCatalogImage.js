/** Square catalog photos for warehouse / product list thumbnails (~3cm list cell, hover up to ~512px). */
export const WAREHOUSE_CATALOG_IMAGE_PX = 512;

function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      type,
      quality,
    );
  });
}

function isLetterboxPixel(r, g, b, a) {
  if (a < 12) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 232 && max - min < 24;
}

function findContentBounds(imageData, width, height) {
  const { data } = imageData;
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  let found = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (isLetterboxPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      found = true;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }

  if (!found) {
    return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  }

  const padX = Math.max(1, Math.round((x1 - x0 + 1) * 0.02));
  const padY = Math.max(1, Math.round((y1 - y0 + 1) * 0.02));
  return {
    x0: Math.max(0, x0 - padX),
    y0: Math.max(0, y0 - padY),
    x1: Math.min(width - 1, x1 + padX),
    y1: Math.min(height - 1, y1 + padY),
  };
}

/** Only trim when obvious empty bands exist (avoids zooming into a corner on product photos). */
function shouldUseTrimmedBounds(bounds, width, height) {
  const cw = bounds.x1 - bounds.x0 + 1;
  const ch = bounds.y1 - bounds.y0 + 1;
  const areaRatio = (cw * ch) / (width * height);
  if (areaRatio > 0.92) return false;

  const left = bounds.x0 / width;
  const right = (width - 1 - bounds.x1) / width;
  const top = bounds.y0 / height;
  const bottom = (height - 1 - bounds.y1) / height;

  const horizontalLetterbox = left > 0.04 && right > 0.04;
  const verticalLetterbox = top > 0.04 && bottom > 0.04;
  return horizontalLetterbox || verticalLetterbox;
}

/**
 * Center-cover into a square canvas. Optional trim only for clear letterbox margins.
 * @param {HTMLImageElement} img
 * @param {number} size
 * @returns {HTMLCanvasElement}
 */
export function drawImageToSquareCanvas(img, size = WAREHOUSE_CATALOG_IMAGE_PX) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Invalid image dimensions');

  let x0 = 0;
  let y0 = 0;
  let x1 = w - 1;
  let y1 = h - 1;

  try {
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    if (tctx) {
      tctx.drawImage(img, 0, 0);
      const bounds = findContentBounds(tctx.getImageData(0, 0, w, h), w, h);
      if (shouldUseTrimmedBounds(bounds, w, h)) {
        x0 = bounds.x0;
        y0 = bounds.y0;
        x1 = bounds.x1;
        y1 = bounds.y1;
      }
    }
  } catch {
    // Tainted canvas (CORS) — cover-crop the full frame only.
  }

  const cw = Math.max(1, x1 - x0 + 1);
  const ch = Math.max(1, y1 - y0 + 1);
  const scale = Math.max(size / cw, size / ch);
  const sw = size / scale;
  const sh = size / scale;
  const sx = x0 + (cw - sw) / 2;
  const sy = y0 + (ch - sh) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return canvas;
}

/**
 * @param {File} file
 * @param {number} [size=512]
 * @returns {Promise<File>}
 */
export async function fileToSquareCatalogImage(file, size = WAREHOUSE_CATALOG_IMAGE_PX) {
  const img = await loadImageFromFile(file);
  const canvas = drawImageToSquareCanvas(img, size);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const base = (file.name || 'product').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}-square.jpg`, { type: 'image/jpeg' });
}
