import sharp from 'sharp';
import { fetchImageBuffer } from './imageFingerprint.js';

const MODEL = 'gemini-embedding-2';
const OUTPUT_DIMENSIONALITY = 768;

export const GEMINI_EMBEDDING_VERSION = `${MODEL}:${OUTPUT_DIMENSIONALITY}`;

export function getGeminiApiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

export function isGeminiEmbeddingEnabled() {
  return Boolean(getGeminiApiKey());
}

async function prepareImageForEmbedding(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function requestGeminiEmbedding(jpegBuffer) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        content: {
          parts: [{
            inline_data: {
              mime_type: 'image/jpeg',
              data: jpegBuffer.toString('base64'),
            },
          }],
        },
        output_dimensionality: OUTPUT_DIMENSIONALITY,
      }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini embed failed (${response.status}).`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  const values = payload?.embedding?.values || payload?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new Error('Gemini embed returned no embedding vector.');
  }
  return values;
}

export async function embedImageBuffer(buffer) {
  const prepared = await prepareImageForEmbedding(buffer);
  return requestGeminiEmbedding(prepared);
}

export async function embedImageFromUrl(url) {
  const buffer = await fetchImageBuffer(url);
  return embedImageBuffer(buffer);
}

export async function embedImageFromBase64(base64) {
  const raw = String(base64 || '').trim();
  const payload = raw.includes(',') ? raw.split(',').pop() : raw;
  const buffer = Buffer.from(payload, 'base64');
  return embedImageBuffer(buffer);
}
