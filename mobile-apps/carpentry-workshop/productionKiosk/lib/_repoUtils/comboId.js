export function buildComboIdCandidates(rawId) {
  const key = String(rawId ?? '').trim();
  if (!key) return [];
  const candidates = new Set([key]);
  const num = Number(key);
  if (Number.isFinite(num)) candidates.add(num);
  return Array.from(candidates);
}

export function matchesComboId(left, right) {
  const leftKey = String(left ?? '').trim();
  const rightKey = String(right ?? '').trim();
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  const leftNum = Number(leftKey);
  const rightNum = Number(rightKey);
  return Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum === rightNum;
}

export function filterRowsByComboId(rows, comboId) {
  return (rows || []).filter((row) => matchesComboId(row?.combo_id, comboId));
}
