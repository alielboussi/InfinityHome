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
  const w = Math.min(canvas.width, 120);
  const h = Math.min(canvas.height, 120);
  const { data } = ctx.getImageData(0, 0, w, h);
  let nearWhite = 0;
  let dark = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) nearWhite += 1;
    if (r < 48 && g < 48 && b < 48) dark += 1;
  }
  const whiteRatio = nearWhite / pixels;
  const darkRatio = dark / pixels;
  // Empty captures are all-white with almost no ink (text/QR/logo).
  return whiteRatio > 0.97 && darkRatio < 0.004;
}

async function waitForCanvasPaint(root) {
  const canvases = Array.from(root?.querySelectorAll?.('canvas') || []);
  if (!canvases.length) return;
  await waitForLayout();
  await new Promise((resolve) => setTimeout(resolve, 120));
}

export async function renderLabelNodeToCanvas(node) {
  if (!node) throw new Error('Missing label node to render');
  const captureRoot = node.closest('.plm-hidden-render') || node;
  const prevVisibility = captureRoot.style.visibility;
  const prevPointerEvents = captureRoot.style.pointerEvents;
  captureRoot.style.visibility = 'visible';
  captureRoot.style.pointerEvents = 'none';

  try {
    await waitForImages(node);
    await waitForCanvasPaint(node);
    await waitForLayout();
    await new Promise((r) => setTimeout(r, 80));

    const width = node.offsetWidth || node.scrollWidth;
    if (!width) {
      throw new Error('Label layout is not ready (zero width). Try again.');
    }
    const scale = Math.min(2.5, Math.max(1.5, 794 / width));

    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      foreignObjectRendering: false,
      imageTimeout: 15000,
      scale,
      logging: false,
      width: node.offsetWidth,
      height: node.offsetHeight,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });

    if (canvasLooksBlank(canvas)) {
      throw new Error('Label capture produced a blank page. Check logo images and try again.');
    }
    return canvas;
  } finally {
    captureRoot.style.visibility = prevVisibility;
    captureRoot.style.pointerEvents = prevPointerEvents;
  }
}
