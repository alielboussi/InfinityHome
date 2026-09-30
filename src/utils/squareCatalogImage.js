/** Square catalog photos for warehouse / product list thumbnails (displayed at 72px, hover up to ~512px). */
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

/**
 * Center-crop to square and resize for sharp list thumbnails (no client upscale on hover).
 * @param {File} file
 * @param {number} [size=512]
 * @returns {Promise<File>}
 */
export async function fileToSquareCatalogImage(file, size = WAREHOUSE_CATALOG_IMAGE_PX) {
  const img = await loadImageFromFile(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Invalid image dimensions');

  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const base = (file.name || 'product').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}-square.jpg`, { type: 'image/jpeg' });
}
