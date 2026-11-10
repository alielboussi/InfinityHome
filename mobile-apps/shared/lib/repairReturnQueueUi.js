/** Workshop repair queue — optimistic timer UI while warehouse-mobile mutates one row. */

export function mergeReturnOrderRow(setRows, order) {
  const id = String(order?.id || '').trim();
  if (!id) return;
  setRows((prev) => prev.map((row) => (
    String(row.id) === id ? { ...row, ...order } : row
  )));
}

export function optimisticReturnTimerRow(row, action) {
  const id = String(row?.id || '').trim();
  if (!id) return null;
  if (action === 'accept') {
    return {
      ...row,
      status: 'in_progress',
      timer_status: 'running',
      elapsed_ms: Math.max(0, Number(row.elapsed_ms) || 0),
    };
  }
  if (action === 'resume') {
    return {
      ...row,
      status: 'in_progress',
      timer_status: 'running',
    };
  }
  if (action === 'pause') {
    return {
      ...row,
      status: 'in_progress',
      timer_status: 'paused',
    };
  }
  return null;
}
