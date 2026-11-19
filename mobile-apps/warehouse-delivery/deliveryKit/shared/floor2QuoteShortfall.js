export function isFloor2ManufactureBlockError(message) {
  const m = String(message || '');
  return m.includes('Manufacture') && m.includes('Floor 2');
}