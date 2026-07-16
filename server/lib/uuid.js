import { randomUUID as nodeRandomUUID } from 'crypto';

/** Generate a UUID in Node (Vercel serverless) with safe fallbacks. */
export function newUuid() {
  try {
    if (typeof globalThis?.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {}
  try {
    return nodeRandomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
