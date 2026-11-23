export function isFloor2ManufactureBlockError(message) {
  const m = String(message || '');
  if (m.includes('Not enough Floor 2 WIP stock')) return true;
  return m.includes('Manufacture') && m.includes('Floor 2');
}