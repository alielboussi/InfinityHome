import sharp from 'sharp';

const GRID = 8;
const HIST_BINS = 8;

function normalizeVector(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

export async function fetchImageBuffer(url) {
  const raw = String(url || '').trim();
  if (!raw) throw new Error('Image URL is required.');
  const response = await fetch(raw);
  if (!response.ok) throw new Error(`Image fetch failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export async function computeFingerprintFromBuffer(buffer) {
  let pipeline = sharp(buffer).rotate();
  try {
    pipeline = pipeline.trim({ threshold: 24 });
  } catch {
    // trim can fail on uniform images; continue without trim
  }

  const { data, info } = await pipeline
    .resize(GRID, GRID, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histR = new Array(HIST_BINS).fill(0);
  const histG = new Array(HIST_BINS).fill(0);
  const histB = new Array(HIST_BINS).fill(0);
  const grid = [];
  const pixelCount = data.length / 3;

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    histR[Math.min(HIST_BINS - 1, r >> 5)] += 1;
    histG[Math.min(HIST_BINS - 1, g >> 5)] += 1;
    histB[Math.min(HIST_BINS - 1, b >> 5)] += 1;
  }

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 3;
      grid.push(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255);
    }
  }

  const hist = [...histR, ...histG, ...histB].map((count) => count / pixelCount);
  return normalizeVector([...hist, ...grid]);
}

export async function computeFingerprintFromUrl(url) {
  const buffer = await fetchImageBuffer(url);
  return computeFingerprintFromBuffer(buffer);
}

export async function computeFingerprintFromBase64(base64) {
  const raw = String(base64 || '').trim();
  const payload = raw.includes(',') ? raw.split(',').pop() : raw;
  const buffer = Buffer.from(payload, 'base64');
  return computeFingerprintFromBuffer(buffer);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}
