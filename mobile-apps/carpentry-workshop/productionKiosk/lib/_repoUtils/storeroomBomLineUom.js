/**
 * BOM lines on /carpentry and /upholstery use the UOM stored on the storeroom material.
 */
export function uomFromStoreroomMaterial(materialOptions, materialAssemblyId) {
  const mid = String(materialAssemblyId || '').trim();
  if (!mid) return '';
  const mat = (materialOptions || []).find((m) => String(m.id) === mid);
  return String(mat?.default_uom || '').trim();
}

export function applyStoreroomMaterialUomToLine(line, materialOptions) {
  if (!line || typeof line !== 'object') return line;
  return {
    ...line,
    uom: uomFromStoreroomMaterial(materialOptions, line.material_assembly_id),
  };
}

export function labelForMaterialUom(code, uomOptions) {
  const v = String(code || '').trim();
  if (!v) return '—';
  const hit = (uomOptions || []).find((o) => String(o.value) === v);
  return hit?.label || v;
}
