/**
 * Resolve warehouse / catalog category_id → display name (Firestore id or legacy name storage).
 */

export function buildWarehouseCategoryIndex(categories) {
  const byId = new Map();
  const byNameLower = new Map();
  (categories || []).forEach((row) => {
    const id = String(row?.id ?? '').trim();
    const name = String(row?.name ?? '').trim();
    if (id) byId.set(id, name);
    if (name) byNameLower.set(name.toLowerCase(), name);
  });
  return { byId, byNameLower };
}

export function resolveWarehouseCategoryName(categoryId, index) {
  if (categoryId == null || categoryId === '') return '';
  const key = String(categoryId).trim();
  if (!key) return '';

  const fromId = index?.byId?.get(key);
  if (fromId) return fromId;

  for (const [id, name] of index?.byId || []) {
    if (String(id) === key) return name;
  }

  const fromName = index?.byNameLower?.get(key.toLowerCase());
  if (fromName) return fromName;

  return '';
}

export function resolveWarehouseCategoryNameFromList(categoryId, categories) {
  return resolveWarehouseCategoryName(categoryId, buildWarehouseCategoryIndex(categories));
}
