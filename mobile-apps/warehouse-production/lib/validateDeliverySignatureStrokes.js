/**
 * Reject empty pads, single dots, and trivial taps.
 * @param {Array<{ points: Array<{x:number,y:number}> }>} strokes
 */
export function validateDeliverySignatureStrokes(strokes) {
  const list = Array.isArray(strokes) ? strokes : [];
  if (!list.length) {
    return { ok: false, code: 'empty' };
  }

  let totalLength = 0;
  let totalPoints = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let strokesWithLine = 0;

  for (const stroke of list) {
    const pts = stroke?.points || [];
    if (pts.length >= 2) strokesWithLine += 1;
    totalPoints += pts.length;
    for (let i = 1; i < pts.length; i += 1) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLength += Math.hypot(dx, dy);
    }
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (strokesWithLine < 1) {
    return { ok: false, code: 'dots' };
  }
  const span = Math.hypot(maxX - minX, maxY - minY);
  if (span < 48 || totalLength < 120 || totalPoints < 5) {
    return { ok: false, code: 'too_small' };
  }
  return { ok: true };
}
