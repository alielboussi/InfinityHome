/** Box/carton line on warehouse labels (after Color, before Date). */
export function formatProductionLabelBoxLine(unitsPerBox) {
  const per = Math.max(1, Math.floor(Number(unitsPerBox) || 0));
  if (per <= 1) return '';
  const unitWord = per === 1 ? 'Unit' : 'Units';
  return `1 Box = ${per} ${unitWord}`;
}

export function productionLabelIncludesBoxRow(boxLineOrUnitsPerBox) {
  if (typeof boxLineOrUnitsPerBox === 'number') {
    return Math.floor(Number(boxLineOrUnitsPerBox) || 0) > 1;
  }
  return Boolean(String(boxLineOrUnitsPerBox || '').trim());
}

export function resolveProductionLabelBoxLine({ boxLine, boxUnitsPerCarton, unitsPerCarton } = {}) {
  const explicit = String(boxLine || '').trim();
  if (explicit) return explicit.slice(0, 72);
  const per = boxUnitsPerCarton ?? unitsPerCarton;
  return formatProductionLabelBoxLine(per);
}
