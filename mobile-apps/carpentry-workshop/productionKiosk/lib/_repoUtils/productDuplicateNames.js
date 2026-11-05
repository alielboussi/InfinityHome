/** Collapse spaces, ignore case, and sort tokens so word order does not matter. */
export function normalizeProductNameKey(name) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return '';
  const collapsed = raw.replace(/\s+/g, ' ');
  const tokens = collapsed.split(' ').filter(Boolean);
  tokens.sort((left, right) => left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true,
  }));
  return tokens.join(' ');
}

export function buildDuplicateNameGroups(items, getName = (item) => item?.name) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const key = normalizeProductNameKey(getName(item));
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

export function getDuplicateProductNameInfo(items, getName = (item) => item?.name) {
  const groups = buildDuplicateNameGroups(items, getName);
  const ids = new Set();
  groups.forEach((group) => {
    group.forEach((item) => {
      if (item?.id != null) ids.add(String(item.id));
    });
  });
  return {
    groups,
    ids,
    groupCount: groups.length,
    productCount: ids.size,
  };
}
