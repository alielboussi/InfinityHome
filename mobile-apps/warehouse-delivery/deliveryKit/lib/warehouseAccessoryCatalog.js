/** Warehouse accessories — catalog_role on warehouse_assemblies.metadata (no app rebuild for new subcategories). */

export const WAREHOUSE_CATALOG_ROLE = Object.freeze({
  ACCESSORY: 'accessory',
  ACCESSORY_SUBCATEGORY: 'accessory_subcategory',
});

export function readWarehouseCatalogRole(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return String(meta.catalog_role || meta.catalogRole || '').trim().toLowerCase();
}

export function isWarehouseAccessory(assembly) {
  return readWarehouseCatalogRole(assembly) === WAREHOUSE_CATALOG_ROLE.ACCESSORY;
}

export function isWarehouseAccessorySubcategory(assembly) {
  return readWarehouseCatalogRole(assembly) === WAREHOUSE_CATALOG_ROLE.ACCESSORY_SUBCATEGORY;
}

export function accessoryImageUrl(assembly) {
  if (!assembly || typeof assembly !== 'object') return '';
  const meta = assembly.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return String(
    assembly.image_url
    || assembly.thumbnail_url
    || assembly.cover_image_url
    || assembly.photo_url
    || meta.floor2_wip_image_url
    || '',
  ).trim();
}

export function accessorySubcategoryId(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return String(meta.accessory_subcategory_id || '').trim();
}

export function listAccessorySubcategories(assemblies = []) {
  return (assemblies || [])
    .filter(isWarehouseAccessorySubcategory)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || '').trim() || 'Accessory',
      sort: String(row.name || '').toLowerCase(),
    }))
    .sort((a, b) => a.sort.localeCompare(b.sort));
}

export function listAccessoriesForSubcategory(assemblies = [], subcategoryId) {
  const sid = String(subcategoryId || '').trim();
  return (assemblies || [])
    .filter((row) => isWarehouseAccessory(row) && accessorySubcategoryId(row) === sid)
    .map((row) => ({
      id: String(row.id),
      name: String(row.name || '').trim(),
      sku: String(row.family_sku || '').trim(),
      image_url: accessoryImageUrl(row),
      subcategory_id: sid,
      subcategory_name: String(row.metadata?.accessory_subcategory_name || '').trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizeAccessoryPicks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const assembly_id = String(row.assembly_id || row.id || '').trim();
    const name = String(row.name || '').trim();
    if (!assembly_id && !name) continue;
    const slot = Math.max(1, Math.floor(Number(row.slot) || 1));
    out.push({
      subcategory_id: String(row.subcategory_id || '').trim(),
      subcategory_name: String(row.subcategory_name || '').trim(),
      slot,
      assembly_id,
      name,
      sku: String(row.sku || '').trim(),
      image_url: String(row.image_url || '').trim(),
    });
  }
  return out.sort((a, b) => {
    const n = String(a.subcategory_name || a.subcategory_id)
      .localeCompare(String(b.subcategory_name || b.subcategory_id));
    if (n) return n;
    return a.slot - b.slot;
  });
}

export function accessoryPicksToAccessoriesList(picks) {
  const labeled = normalizeAccessoryPicks(picks).map((p) => {
    const sub = p.subcategory_name || 'Accessory';
    return `${p.slot}. ${sub}: ${p.name}`;
  });
  return labeled;
}

export function upsertAccessoryPick(picks, nextPick) {
  const list = normalizeAccessoryPicks(picks);
  const subcategory_id = String(nextPick?.subcategory_id || '').trim();
  const slot = Math.max(1, Math.floor(Number(nextPick?.slot) || 1));
  const without = list.filter((p) => !(p.subcategory_id === subcategory_id && p.slot === slot));
  const assembly_id = String(nextPick?.assembly_id || '').trim();
  if (!assembly_id) return without;
  return normalizeAccessoryPicks([...without, nextPick]);
}

export function slotCountForSubcategory(picks, subcategoryId) {
  const sid = String(subcategoryId || '').trim();
  const slots = normalizeAccessoryPicks(picks)
    .filter((p) => p.subcategory_id === sid)
    .map((p) => p.slot);
  return Math.max(1, slots.length ? Math.max(...slots) : 1);
}

export function readProductAccessorySubcategoryIds(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  const raw = meta.accessory_subcategory_ids ?? assembly?.accessory_subcategory_ids;
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
}

export function normalizeAccessorySubcategoryFields(raw, catalogSubs = []) {
  const byId = new Map((catalogSubs || []).map((s) => [String(s.id), s]));
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of list) {
    if (row == null || row === '') continue;
    const id = String(typeof row === 'object' ? (row.id || row.subcategory_id) : row).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const named = typeof row === 'object' ? String(row.name || row.subcategory_name || '').trim() : '';
    out.push({
      id,
      name: named || byId.get(id)?.name || 'Accessory',
    });
  }
  return out;
}

export function resolveLineAccessorySubcategories({ item, assemblies = [] } = {}) {
  const catalog = listAccessorySubcategories(assemblies);
  const fromLine = normalizeAccessorySubcategoryFields(
    item?.accessory_subcategory_fields ?? item?.metadata?.accessory_subcategory_fields,
    catalog,
  );
  if (fromLine.length) return fromLine;

  const aid = String(
    item?.floor2_assembly_id
    || item?.metadata?.floor2_assembly_id
    || item?.warehouse_assembly_id
    || '',
  ).trim();
  let asm = aid ? (assemblies || []).find((a) => String(a.id) === aid) : null;
  if (!asm) {
    const nameKey = String(item?.name || '').trim().toLowerCase();
    const skuKey = String(item?.sku || item?.family_sku || '').trim().toLowerCase();
    asm = (assemblies || []).find((a) => {
      if (isWarehouseAccessory(a) || isWarehouseAccessorySubcategory(a)) return false;
      if (skuKey && String(a.family_sku || '').trim().toLowerCase() === skuKey) return true;
      return nameKey && String(a.name || '').trim().toLowerCase() === nameKey;
    });
  }
  const ids = readProductAccessorySubcategoryIds(asm);
  return normalizeAccessorySubcategoryFields(ids, catalog);
}
