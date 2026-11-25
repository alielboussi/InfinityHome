/** Shrink quote line photos so JSON uploads stay under the Vercel body limit. */

const MAX_EDGE = 1280;
const QUALITY = 0.72;
const HARD_MAX_BYTES = 1_200_000;

function loadFromElement(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image. Try JPEG or PNG.'));
    };
    img.src = url;
  });
}

async function canvasJpeg(draw, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not compress image');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  draw(ctx, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not compress image'))),
      'image/jpeg',
      quality,
    );
  });
  return blob;
}

export async function compressQuoteLineImageFile(file) {
  if (!file) throw new Error('No image to upload');
  let bitmap = null;
  let width = 0;
  let height = 0;
  let draw = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
    }
  } catch {
    bitmap = null;
  }
  if (!draw) {
    const img = await loadFromElement(file);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
  let w = Math.max(1, Math.round(width * scale));
  let h = Math.max(1, Math.round(height * scale));
  let blob = await canvasJpeg(draw, w, h, QUALITY);
  if (blob.size > HARD_MAX_BYTES) {
    w = Math.max(1, Math.round(w * 0.75));
    h = Math.max(1, Math.round(h * 0.75));
    blob = await canvasJpeg(draw, w, h, 0.55);
  }
  if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  return new File([blob], 'quote-line.jpg', { type: 'image/jpeg' });
}
