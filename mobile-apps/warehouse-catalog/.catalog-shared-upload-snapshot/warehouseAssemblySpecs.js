/** L × W × H (cm) — matches src/utils/warehouseAssemblySpecs.js (web catalog). */

export function formatAssemblyDimensions(assembly) {
  const l = assembly?.dim_length;
  const w = assembly?.dim_width;
  const h = assembly?.dim_height;
  const hasAny = [l, w, h].some((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  if (!hasAny) return '';
  const fmt = (v) => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '—';
  };
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} cm`;
}

function numOrEmpty(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '';
}

export function assemblyDimsDraftFromItem(item) {
  return {
    dim_length: numOrEmpty(item?.dim_length),
    dim_width: numOrEmpty(item?.dim_width),
    dim_height: numOrEmpty(item?.dim_height),
  };
}
