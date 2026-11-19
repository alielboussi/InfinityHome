function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

export const MAX_QUOTE_DIMENSION_SETS = 24;

export function parseLegacyDimensionsLwh(raw) {
  const s = trimOrNull(raw);
  if (!s) return { dim_l_cm: null, dim_w_cm: null, dim_h_cm: null };
  const parts = s.split(/[x×*]/i).map((p) => trimOrNull(p)).filter(Boolean);
  return {
    dim_l_cm: parts[0] || null,
    dim_w_cm: parts[1] || null,
    dim_h_cm: parts[2] || null,
  };
}

export function formatQuoteDimensionsCm({ dim_l_cm, dim_w_cm, dim_h_cm, dimensions_lwh } = {}) {
  const l = trimOrNull(dim_l_cm);
  const w = trimOrNull(dim_w_cm);
  const h = trimOrNull(dim_h_cm);
  if (l && w && h) return `${l} × ${w} × ${h}`;
  const legacy = trimOrNull(dimensions_lwh);
  if (legacy) return legacy.replace(/\s*[x×*]\s*/gi, ' × ');
  const partial = [l, w, h].filter(Boolean);
  if (partial.length) return partial.join(' × ');
  return null;
}

function quoteLineQtyForDimensions(it) {
  const q = it?.quantity;
  const unitPrice = it?.unit_price;
  if (q === '' || q === null || q === undefined) return 1;
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) {
    return Number(unitPrice || 0) > 0 ? 1 : 1;
  }
  return Math.min(MAX_QUOTE_DIMENSION_SETS, Math.max(1, Math.floor(n)));
}

export function normalizeQuoteDimensionSet(raw = {}) {
  return {
    dim_l_cm: trimOrNull(raw?.dim_l_cm) || '',
    dim_w_cm: trimOrNull(raw?.dim_w_cm) || '',
    dim_h_cm: trimOrNull(raw?.dim_h_cm) || '',
  };
}

export function resizeQuoteDimensionSets(sets, targetCount) {
  const n = Math.max(1, Math.min(MAX_QUOTE_DIMENSION_SETS, Math.floor(Number(targetCount)) || 1));
  const base = Array.isArray(sets) ? sets.map(normalizeQuoteDimensionSet) : [];
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const prev = base[i] || {};
    out.push({
      dim_l_cm: prev.dim_l_cm || '',
      dim_w_cm: prev.dim_w_cm || '',
      dim_h_cm: prev.dim_h_cm || '',
    });
  }
  return out;
}

export function readQuoteDimensionSets(it, qty = null) {
  const meta = it?.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  const q = qty != null ? qty : quoteLineQtyForDimensions(it);
  const fromArray = Array.isArray(it?.dimension_sets) && it.dimension_sets.length
    ? it.dimension_sets
    : (Array.isArray(meta.dimension_sets) ? meta.dimension_sets : null);
  if (fromArray?.length) {
    return resizeQuoteDimensionSets(fromArray, q);
  }
  let dim_l_cm = trimOrNull(it?.dim_l_cm ?? meta.dim_l_cm) || '';
  let dim_w_cm = trimOrNull(it?.dim_w_cm ?? meta.dim_w_cm) || '';
  let dim_h_cm = trimOrNull(it?.dim_h_cm ?? meta.dim_h_cm) || '';
  if (!dim_l_cm && !dim_w_cm && !dim_h_cm) {
    const legacy = parseLegacyDimensionsLwh(it?.dimensions_lwh ?? meta.dimensions_lwh);
    dim_l_cm = legacy.dim_l_cm || '';
    dim_w_cm = legacy.dim_w_cm || '';
    dim_h_cm = legacy.dim_h_cm || '';
  }
  return resizeQuoteDimensionSets([{ dim_l_cm, dim_w_cm, dim_h_cm }], q);
}

export function applyQuoteDimensionSetsToLineFields(sets) {
  const sized = resizeQuoteDimensionSets(sets, sets?.length || 1);
  const first = sized[0] || normalizeQuoteDimensionSet();
  const dimensions_lwh = formatQuoteDimensionsCm(first) || '';
  return {
    dimension_sets: sized,
    dim_l_cm: first.dim_l_cm || '',
    dim_w_cm: first.dim_w_cm || '',
    dim_h_cm: first.dim_h_cm || '',
    dimensions_lwh,
  };
}