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
        label: formatStoreroomOptionLabel({ id, name, label: WAREHOUSE_NAME_TO_STOREROOM_LABEL[name] }),
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
        label: formatStoreroomOptionLabel(row),
      }))
      .filter((row) => row.id);
  }
  const fromMaterials = storeroomsFromMaterialLocationRows(payload?.materials || []);
  if (fromMaterials.length) return fromMaterials;
  return [];
}

function storeroomLabelForLocation(id, locationName, labelCatalog) {
  const catalog = (labelCatalog || []).find((s) => String(s.id) === String(id));
  const name = String(locationName || catalog?.name || '').trim();
  return catalog?.label || WAREHOUSE_NAME_TO_STOREROOM_LABEL[name] || name || String(id);
}

/** Storerooms where this catalog material has on-hand qty > 0 (uses merged `locations` on the row). */
export function storeroomsForCatalogMaterial(materialRow, labelCatalog = []) {
  const out = [];
  const seen = new Set();
  for (const loc of materialRow?.locations || []) {
    const id = String(loc.location_id || '').trim();
    if (!id || seen.has(id)) continue;
    const qty = Math.max(0, Number(loc.quantity) || 0);
    if (qty <= 0) continue;
    seen.add(id);
    const name = String(loc.location_name || '').trim();
    out.push({
      id,
      name,
      label: formatStoreroomOptionLabel({
        name,
        label: storeroomLabelForLocation(id, name, labelCatalog),
      }),
    });
  }
  return out;
}

/**
 * Storerooms that can satisfy a job save/deduct for every line missing warehouse_location_id
 * (intersection of in-stock locations per material).
 */
export function storeroomsForJobMaterialDeduction(materialLines, catalogRows, labelCatalog = []) {
  const catalogById = new Map();
  for (const row of catalogRows || []) {
    const id = String(row.assembly_id || row.id || '').trim();
    if (id) catalogById.set(id, row);
  }
  const need = (materialLines || []).filter((line) => {
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    return qty > 0 && !String(line.warehouse_location_id || '').trim();
  });
  if (!need.length) {
    return storeroomsFromMaterialLocationRows(catalogRows);
  }

  let intersection = null;
  for (const line of need) {
    const aid = String(line.assembly_id || line.material_assembly_id || '').trim();
    const cat = catalogById.get(aid);
    const opts = storeroomsForCatalogMaterial(cat, labelCatalog);
    const ids = new Set(opts.map((s) => s.id));
    if (!ids.size) return [];
    if (intersection === null) intersection = ids;
    else {
      intersection = new Set([...intersection].filter((id) => ids.has(id)));
    }
  }
  if (!intersection?.size) return [];
  return [...intersection]
    .map((id) => {
      const hit = (labelCatalog || []).find((s) => String(s.id) === String(id));
      if (hit) return hit;
      return { id: String(id), name: '', label: String(id) };
    })
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
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

export function catalogMaterialOnHandTotal(row) {
  const locs = row?.locations || [];
  if (locs.length) {
    const fromLocs = locs.reduce(
      (sum, loc) => sum + Math.max(0, Number(loc.quantity) || 0),
      0,
    );
    if (fromLocs > 0) return fromLocs;
  }
  return Math.max(0, Number(row?.quantity) || 0);
}

export function isStoreroomMaterialSelectable(row) {
  return catalogMaterialOnHandTotal(row) > 0;
}

export function filterInStockCatalogMaterials(rows) {
  return (rows || []).filter(isStoreroomMaterialSelectable);
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

export function materialAssemblyIdFromStoredRow(row) {
  const raw = String(row?.material_assembly_id || row?.assembly_id || row?.id || '').trim();
  const hash = raw.indexOf('#');
  if (hash >= 0) return raw.slice(0, hash).trim();
  const colons = raw.indexOf('::');
  if (colons >= 0) return raw.slice(0, colons).trim();
  return raw;
}

export function warehouseLocationIdFromStoredRow(row) {
  const explicit = String(row?.warehouse_location_id || '').trim();
  if (explicit) return explicit;
  const raw = String(row?.material_assembly_id || row?.assembly_id || '');
  const hash = raw.indexOf('#');
  if (hash >= 0) return raw.slice(hash + 1).trim();
  const colons = raw.indexOf('::');
  if (colons >= 0) return raw.slice(colons + 2).trim();
  return '';
}

export function materialLineKey(row) {
  const aid = materialAssemblyIdFromStoredRow(row);
  const loc = warehouseLocationIdFromStoredRow(row);
  if (!aid) return '';
  return loc ? `${aid}::${loc}` : aid;
}

export function formatMaterialUom(row) {
  const label = row?.uom_label;
  if (label) return String(label);
  return humanizeUomCode(row?.uom || 'ea');
}

/** Portal location names → Storeroom 1 / 2 / 3 for kiosk cards. */
/** Storeroom label from a location id when `storeroom_label` was not persisted (legacy job lines). */
export function storeroomLabelForLocationId(locationId, storerooms = []) {
  const id = String(locationId || '').trim();
  if (!id) return '';
  const hit = (storerooms || []).find((s) => String(s.id) === id);
  if (hit) return formatStoreroomOptionLabel(hit);
  const idx = (storerooms || []).findIndex((s) => String(s.id) === id);
  if (idx >= 0) return `Storeroom ${idx + 1}`;
  return '';
}

export function warehouseNameToStoreroomLabel(nameOrLabel) {
  const raw = String(nameOrLabel || '').trim();
  if (!raw) return '';
  if (WAREHOUSE_NAME_TO_STOREROOM_LABEL[raw]) return WAREHOUSE_NAME_TO_STOREROOM_LABEL[raw];
  const match = raw.match(/carpentry\s+warehouse\s*(\d+)/i);
  if (match) return `Storeroom ${match[1]}`;
  if (/^storeroom\s+\d+/i.test(raw)) {
    const n = raw.match(/(\d+)/);
    return n ? `Storeroom ${n[1]}` : raw;
  }
  return raw;
}

export function formatStoreroomOptionLabel(option) {
  const label = String(option?.label || '').trim();
  if (label && !/^carpentry\s+warehouse/i.test(label)) {
    return warehouseNameToStoreroomLabel(label);
  }
  const name = String(option?.name || '').trim();
  return warehouseNameToStoreroomLabel(name) || warehouseNameToStoreroomLabel(label) || label || name;
}

export function catalogQtyAtStoreroom(catalogRow, warehouseLocationId) {
  const locId = String(warehouseLocationId || '').trim();
  if (!locId) return catalogMaterialOnHandTotal(catalogRow);
  const hit = (catalogRow?.locations || []).find(
    (loc) => String(loc.location_id || '') === locId,
  );
  if (hit) return Math.max(0, Number(hit.quantity) || 0);
  return 0;
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
