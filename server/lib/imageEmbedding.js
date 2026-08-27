import {
  computeFingerprintFromBase64,
  computeFingerprintFromUrl,
  cosineSimilarity,
} from './imageFingerprint.js';
import {
  embedImageFromBase64,
  embedImageFromUrl,
  GEMINI_EMBEDDING_VERSION,
  isGeminiEmbeddingEnabled,
} from './geminiImageEmbedding.js';

export const FINGERPRINT_VERSION = 'fingerprint:v1';
const GEMINI_EMBED_DELAY_MS = 150;

export function getActiveEmbeddingVersion() {
  return isGeminiEmbeddingEnabled() ? GEMINI_EMBEDDING_VERSION : FINGERPRINT_VERSION;
}

export function getActiveEmbeddingMethod() {
  return isGeminiEmbeddingEnabled() ? 'gemini' : 'fingerprint';
}

export function hasValidStoredVector(data) {
  const version = getActiveEmbeddingVersion();
  if (version === GEMINI_EMBEDDING_VERSION) {
    return Array.isArray(data?.embedding)
      && data.embedding.length > 0
      && data.embedding_model === version;
  }
  return Array.isArray(data?.fingerprint) && data.fingerprint.length > 0;
}

export function extractStoredVector(data) {
  const version = getActiveEmbeddingVersion();
  if (version === GEMINI_EMBEDDING_VERSION) {
    return data?.embedding;
  }
  return data?.fingerprint;
}

export function scoreVectors(a, b) {
  return cosineSimilarity(a, b);
}

export async function computeVectorFromUrl(url) {
  if (isGeminiEmbeddingEnabled()) {
    return {
      values: await embedImageFromUrl(url),
      model: GEMINI_EMBEDDING_VERSION,
      method: 'gemini',
    };
  }
  return {
    values: await computeFingerprintFromUrl(url),
    model: FINGERPRINT_VERSION,
    method: 'fingerprint',
  };
}

export async function computeVectorFromBase64(base64) {
  if (isGeminiEmbeddingEnabled()) {
    return {
      values: await embedImageFromBase64(base64),
      model: GEMINI_EMBEDDING_VERSION,
      method: 'gemini',
    };
  }
  return {
    values: await computeFingerprintFromBase64(base64),
    model: FINGERPRINT_VERSION,
    method: 'fingerprint',
  };
}

export async function pauseBetweenEmbeds(method, embeddedCount) {
  if (method !== 'gemini' || embeddedCount <= 0) return;
  await new Promise((resolve) => {
    setTimeout(resolve, GEMINI_EMBED_DELAY_MS);
  });
}
