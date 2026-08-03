import html2canvas from 'html2canvas';

export function sanitizeLocationFilenamePart(locationName) {
  const slug = String(locationName || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'Location';
}

export function buildPriceLabelFilename(locationName, at = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  const locationPart = sanitizeLocationFilenamePart(locationName);
  return `${locationPart}_Price_Printing_${date}_${time}`;
}

export function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function waitForImages(root) {
  const imgs = Array.from(root?.querySelectorAll?.('img') || []);
  if (!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 4000);
    });
  }));
}

export function canvasLooksBlank(canvas) {
  if (!canvas || canvas.width < 8 || canvas.height < 8) return true;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const w = Math.min(canvas.width, 48);
  const h = Math.min(canvas.height, 48);
  const { data } = ctx.getImageData(0, 0, w, h);
  let nearWhite = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) nearWhite++;
  }
  return nearWhite / pixels < 0.05;
}

export async function renderLabelNodeToCanvas(node) {
  if (!node) throw new Error('Missing label node to render');
  await waitForImages(node);
  await waitForLayout();
  await new Promise((r) => setTimeout(r, 50));

  const width = node.offsetWidth || node.scrollWidth;
  const scale = width > 0 ? Math.min(2.5, Math.max(1.5, 794 / width)) : 2;

  const canvas = await html2canvas(node, {
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: true,
    foreignObjectRendering: false,
    imageTimeout: 15000,
    scale,
    logging: false,
  });

  if (canvasLooksBlank(canvas)) {
    throw new Error('Label capture produced a blank page. Check logo images and try again.');
  }
  return canvas;
}
