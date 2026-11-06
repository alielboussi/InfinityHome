function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

/** Allowed carpentry wood types (Quotationer + workshop display). */
export const CARPENTRY_WOOD_OPTIONS = [
  'Laminated',
  'Rosewood',
  'Mukwa',
  'Hardwood',
  'Sprayed Wood',
  'Melamine Wood',
];

export function normalizeCarpentryWoodChoice(raw) {
  const v = trimOrNull(raw);
  if (!v) return null;
  const match = CARPENTRY_WOOD_OPTIONS.find((o) => o.toLowerCase() === v.toLowerCase());
  return match || null;
}

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

export function hasQuoteDimensionCm({ dim_l_cm, dim_w_cm, dim_h_cm, dimensions_lwh } = {}) {
  return Boolean(
    trimOrNull(dim_l_cm)
    || trimOrNull(dim_w_cm)
    || trimOrNull(dim_h_cm)
    || trimOrNull(dimensions_lwh),
  );
}

/** Read optional workshop fields from a quotation_items row or client item. */
export function pickQuoteItemProductionFields(it) {
  const meta = it?.metadata && typeof it.metadata === 'object' ? it.metadata : {};
  let dim_l_cm = trimOrNull(it?.dim_l_cm ?? meta.dim_l_cm);
  let dim_w_cm = trimOrNull(it?.dim_w_cm ?? meta.dim_w_cm);
  let dim_h_cm = trimOrNull(it?.dim_h_cm ?? meta.dim_h_cm);
  if (!dim_l_cm && !dim_w_cm && !dim_h_cm) {
    const legacy = parseLegacyDimensionsLwh(it?.dimensions_lwh ?? meta.dimensions_lwh);
    dim_l_cm = legacy.dim_l_cm;
    dim_w_cm = legacy.dim_w_cm;
    dim_h_cm = legacy.dim_h_cm;
  }
  const dimensions_lwh = formatQuoteDimensionsCm({ dim_l_cm, dim_w_cm, dim_h_cm });
  return {
    leather_code: trimOrNull(it?.leather_code ?? meta.leather_code),
    dim_l_cm,
    dim_w_cm,
    dim_h_cm,
    dimensions_lwh,
    color_code: trimOrNull(it?.color_code ?? meta.color_code),
    wood: normalizeCarpentryWoodChoice(it?.wood ?? meta.wood),
  };
}

/** JSON metadata column payload for quotation_items (omit when empty). */
export function buildQuoteItemMetadataFromPayload(it) {
  const fields = pickQuoteItemProductionFields(it);
  const out = {};
  if (fields.leather_code) out.leather_code = fields.leather_code;
  if (fields.dim_l_cm) out.dim_l_cm = fields.dim_l_cm;
  if (fields.dim_w_cm) out.dim_w_cm = fields.dim_w_cm;
  if (fields.dim_h_cm) out.dim_h_cm = fields.dim_h_cm;
  if (fields.dimensions_lwh) out.dimensions_lwh = fields.dimensions_lwh;
  if (fields.color_code) out.color_code = fields.color_code;
  if (fields.wood) out.wood = fields.wood;
  return Object.keys(out).length ? out : null;
}

/** Format per-line production bullets for Quote PDF (`-Wood`, `-Lcm Length * Wcm Width * Hcm Height`, `-Color Code: ...`, `-Leather Code: ...`). */
export function formatQuoteItemProductionPdfLines(it) {
  const fields = pickQuoteItemProductionFields(it);
  const lines = [];
  if (fields.wood) {
    lines.push(`-${fields.wood}`);
  }
  const dimParts = [];
  const cleanDim = (val) => String(val).replace(/\s*cm$/i, '').trim();
  if (fields.dim_l_cm) dimParts.push(`${cleanDim(fields.dim_l_cm)}cm Length`);
  if (fields.dim_w_cm) dimParts.push(`${cleanDim(fields.dim_w_cm)}cm Width`);
  if (fields.dim_h_cm) dimParts.push(`${cleanDim(fields.dim_h_cm)}cm Height`);
  if (dimParts.length) {
    lines.push(`-${dimParts.join(' * ')}`);
  }
  if (fields.color_code) {
    lines.push(`-Color Code: ${fields.color_code}`);
  }
  if (fields.leather_code) {
    lines.push(`-Leather Code: ${fields.leather_code}`);
  }
  return lines;
}

/** Line row stored on quote_production_routing.metadata.lines and returned to workshop apps. */
export function buildProductionLineSummaryRow(it) {
  return {
    id: it.id,
    name: it.name_override || it.name || '',
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    ...pickQuoteItemProductionFields(it),
  };
}

export function summarizeProductionQuoteCardExtras(lines, route) {
  const normalized = String(route || '').toLowerCase();
  const list = Array.isArray(lines) ? lines : [];
  const bits = [];
  for (const line of list.slice(0, 3)) {
    if (normalized === 'upholstery' && line.leather_code) {
      bits.push(`Leather: ${line.leather_code}`);
    }
    if (normalized === 'carpentry') {
      const dims = formatQuoteDimensionsCm(line);
      if (dims) bits.push(`L×W×H (cm): ${dims}`);
      if (line.color_code) bits.push(`Color: ${line.color_code}`);
      if (line.wood) bits.push(`Wood: ${line.wood}`);
    }
  }
  return bits.join(' · ');
}
