/** Slug for material UOM codes (dynamic list in warehouse_material_uoms). */

export function slugifyMaterialUomCode(raw) {
  let v = String(raw || '').trim().toLowerCase();
  v = v.replace(/²/g, '2').replace(/\s+/g, '_');
  v = v.replace(/[^a-z0-9_.-]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return v.slice(0, 32);
}

export function labelFromMaterialUomCode(code) {
  const c = slugifyMaterialUomCode(code);
  if (!c) return '';
  return c
    .split('_')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ')
    .replace(/\bM2\b/i, 'm²');
}

/**
 * @param {string} raw
 * @param {Set<string>|undefined} allowedCodes — when set, unknown codes map to first allowed or ''.
 */
export function normalizeMaterialUom(raw, allowedCodes) {
  const v = slugifyMaterialUomCode(raw);
  if (!v) {
    if (allowedCodes?.size) return [...allowedCodes][0];
    return '';
  }
  if (!allowedCodes || allowedCodes.size === 0) return v;
  if (allowedCodes.has(v)) return v;
  return [...allowedCodes][0] || v;
}

/** @deprecated use normalizeMaterialUom */
export function normalizeCarpentryUom(raw, allowedCodes) {
  return normalizeMaterialUom(raw, allowedCodes);
}

export const CARPENTRY_UOM_OPTIONS = [];
export const CARPENTRY_UOM_VALUES = new Set();
