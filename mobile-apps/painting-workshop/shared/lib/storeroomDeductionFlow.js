/** @typedef {{ id: string, name?: string, label?: string }} StoreroomOption */

const WAREHOUSE_NAME_TO_STOREROOM_LABEL = {
  'Carpentry Warehouse 1': 'Storeroom 1',
  'Carpentry Warehouse 2': 'Storeroom 2',
  'Carpentry Warehouse 3': 'Storeroom 3',
};

const UOM_CODE_ALIASES = {
  box_es: 'Box (es)',
  boxes: 'Box (es)',
};

export function humanizeUomCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return 'ea';
  const key = raw.toLowerCase();
  if (UOM_CODE_ALIASES[key]) return UOM_CODE_ALIASES[key];
  if (raw.includes('(') || /\s/.test(raw)) return raw;
  if (!/^[a-z0-9_.-]+$/i.test(raw)) return raw;
  return raw
    .split('_')
    .filter(Boolean)
    .map((part, i, arr) => {
      if (part.toLowerCase() === 'es' && i === arr.length - 1) return '(es)';
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ')
    .replace(/\s+\(es\)$/, ' (es)')
    .trim();
}

export function buildUomLabelMap(payload) {
  const map = new Map();
  const opts = payload?.uom_options || [];
  for (const row of opts) {
    const code = String(row?.value || row?.code || '').trim();
    const label = String(row?.label || '').trim();
    if (code && label) map.set(code, label);
  }
  return map;
}

export function storeroomsFromMaterialLocationRows(materials) {
  const map = new Map();
  for (const row of materials || []) {
    for (const loc of row.locations || []) {
      const id = String(loc.location_id || '').trim();
      if (!id || map.has(id)) continue;
      const name = String(loc.location_name || '').trim();
      map.set(id, {
        id,
        name,
        label: WAREHOUSE_NAME_TO_STOREROOM_LABEL[name] || name || id,
      });
    }
  }
  return [...map.values()];
}

export function parseStoreroomsFromMaterialsApi(payload) {
  if (Array.isArray(payload?.storerooms) && payload.storerooms.length) {
    return payload.storerooms
      .map((row) => ({
        id: String(row.id || '').trim(),
        name: String(row.name || ''),
        label: String(row.label || row.name || ''),
      }))
      .filter((row) => row.id);
  }
  const fromMaterials = storeroomsFromMaterialLocationRows(payload?.materials || []);
  if (fromMaterials.length) return fromMaterials;
  return [];
}

export function materialLinesNeedStoreroomPick(lines) {
  return (lines || []).some((l) => {
    const qty = Math.max(0, Math.floor(Number(l.quantity) || 0));
    return qty > 0 && !String(l.warehouse_location_id || '').trim();
  });
}

export function mergeCatalogByFamilySku(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const sku = String(row.family_sku || '').trim().toUpperCase() || String(row.assembly_id || row.id);
    if (!sku) continue;
    const prev = map.get(sku);
    if (!prev) {
      map.set(sku, { ...row, locations: [...(row.locations || [])] });
      continue;
    }
    prev.quantity = (Number(prev.quantity) || 0) + (Number(row.quantity) || 0);
    const locById = new Map((prev.locations || []).map((loc) => [String(loc.location_id), { ...loc }]));
    for (const loc of row.locations || []) {
      const id = String(loc.location_id);
      const ex = locById.get(id);
      if (ex) ex.quantity = (Number(ex.quantity) || 0) + (Number(loc.quantity) || 0);
      else locById.set(id, { ...loc });
    }
    prev.locations = [...locById.values()];
  }
  return [...map.values()];
}

export function filterInStockCatalogMaterials(rows) {
  return (rows || []).filter((row) => Math.max(0, Number(row.quantity) || 0) > 0);
}

export function enrichCatalogMaterialUom(rows, uomLabelMap) {
  const map = uomLabelMap instanceof Map ? uomLabelMap : new Map();
  return (rows || []).map((row) => {
    const code = String(row.uom || 'ea');
    const uom_label = row.uom_label
      || map.get(code)
      || humanizeUomCode(code);
    return { ...row, uom_label };
  });
}

export function materialLineKey(row) {
  const aid = String(row?.assembly_id || row?.id || '').trim();
  const loc = String(row?.warehouse_location_id || '').trim();
  if (!aid) return '';
  return loc ? `${aid}::${loc}` : aid;
}

export function formatMaterialUom(row) {
  const label = row?.uom_label;
  if (label) return String(label);
  return humanizeUomCode(row?.uom || 'ea');
}

export function carpentryFinishNeedsStoreroomPick(job) {
  const meta = job?.metadata || {};
  return meta.catalog_manufacture === true;
}

export function storeroomDeductionStrings(tUi, locale) {
  const safe = (key, fallback) => {
    try {
      const text = typeof tUi === 'function' ? tUi(key, locale) : '';
      return String(text || fallback);
    } catch {
      return String(fallback);
    }
  };
  return {
    title: safe('storeroomDeductTitle', 'Deduct materials from'),
    pickHint: safe('storeroomDeductPickHint', 'Select storeroom 1, 2, or 3.'),
    confirmHint: safe('storeroomDeductConfirmHint', 'Confirm storeroom:'),
    confirmLabel: safe('confirm', 'Confirm'),
    cancelLabel: safe('cancel', 'Cancel'),
    noStoreroomsHint: safe('storeroomDeductNoList', 'Storerooms could not be loaded.'),
  };
}
