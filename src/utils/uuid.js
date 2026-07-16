/** Generate a UUID in the browser with a safe fallback. */
export function newUuid() {
  try {
    const cryptoRef = typeof window !== 'undefined' ? window.crypto : null;
    if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
      return cryptoRef.randomUUID();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
