/** L × W × H (cm) on warehouse production labels — same semantics as web formatAssemblyDimensions. */
export function formatProductionLabelDimensionsLine({ dimLength, dimWidth, dimHeight, dimensionsLine } = {}) {
  const explicit = String(dimensionsLine || '').trim();
  if (explicit) return explicit.slice(0, 72);
  const parts = [dimLength, dimWidth, dimHeight].map((v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(n) : null;
  });
  if (parts.every((p) => p == null)) return '';
  const fmt = (p) => (p == null ? '—' : p);
  return `${fmt(parts[0])} × ${fmt(parts[1])} × ${fmt(parts[2])} cm`;
}

export function productionLabelIncludesDimensionsRow(dimensionsLine) {
  return Boolean(String(dimensionsLine || '').trim());
}
