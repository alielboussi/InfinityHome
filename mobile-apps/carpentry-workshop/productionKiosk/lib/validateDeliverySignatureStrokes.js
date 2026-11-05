/** Keep ink away from pad borders — edge touches often draw vertical/horizontal slivers. */
export const SIGNATURE_PAD_EDGE_MARGIN = 12;

export function signaturePointInDrawingArea(x, y, width, height, margin = SIGNATURE_PAD_EDGE_MARGIN) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 1 || h < 1) return true;
  const nx = Number(x);
  const ny = Number(y);
  return nx >= margin && nx <= w - margin && ny >= margin && ny <= h - margin;
}

/**
 * Drop thin strokes hugging a pad edge (common accidental palm / bezel touches).
 */
export function isSignatureEdgeArtifactStroke(stroke, width, height, margin = SIGNATURE_PAD_EDGE_MARGIN) {
  const pts = stroke?.points || [];
  if (pts.length < 2) return pts.length < 2;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w < 1 || h < 1) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const xSpan = maxX - minX;
  const ySpan = maxY - minY;
  const thinVertical = xSpan <= 8 && ySpan >= 16;
  const thinHorizontal = ySpan <= 8 && xSpan >= 16;
  if (!thinVertical && !thinHorizontal) return false;

  const nearRight = minX >= w - margin - 4;
  const nearLeft = maxX <= margin + 4;
  const nearTop = maxY <= margin + 4;
  const nearBottom = minY >= h - margin - 4;
  return nearRight || nearLeft || nearTop || nearBottom;
}

/**
 * @param {Array<{ points: Array<{x:number,y:number}> }>} strokes
 * @param {{ width?: number, height?: number }} [layout]
 */
export function sanitizeDeliverySignatureStrokes(strokes, layout = {}) {
  const w = Number(layout.width) || 0;
  const h = Number(layout.height) || 0;
  const margin = SIGNATURE_PAD_EDGE_MARGIN;
  const list = Array.isArray(strokes) ? strokes : [];

  return list
    .map((stroke) => {
      const pts = (stroke?.points || []).filter((p) => signaturePointInDrawingArea(p.x, p.y, w, h, margin));
      return { points: pts };
    })
    .filter((stroke) => stroke.points.length >= 2)
    .filter((stroke) => !isSignatureEdgeArtifactStroke(stroke, w, h, margin));
}

/**
 * Reject empty pads, single dots, and trivial taps.
 * @param {Array<{ points: Array<{x:number,y:number}> }>} strokes
 * @param {{ width?: number, height?: number }} [layout]
 */
export function validateDeliverySignatureStrokes(strokes, layout = {}) {
  const list = sanitizeDeliverySignatureStrokes(strokes, layout);
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
