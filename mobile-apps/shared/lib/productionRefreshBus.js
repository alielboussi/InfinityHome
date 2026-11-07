const listeners = new Set();

export function subscribeProductionRefresh(handler) {
  if (typeof handler !== 'function') return () => {};
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function emitProductionRefresh(reason = '') {
  listeners.forEach((fn) => {
    try {
      fn(reason);
    } catch {
      // ignore subscriber errors
    }
  });
}
