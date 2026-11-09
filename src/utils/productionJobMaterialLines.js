import { CARPENTRY_WAREHOUSE_NAMES } from '../constants/carpentryWarehouses';
import { labelFromMaterialUomCode } from '../constants/carpentryUom';

export function materialLinesFromJob(job) {
  return Array.isArray(job?.manual_material_lines) ? job.manual_material_lines : [];
}

export function materialAssemblyIdFromStoredRow(row) {
  const raw = String(row?.material_assembly_id || row?.assembly_id || '').trim();
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

export function humanizeJobMaterialUom(line) {
  const label = String(line?.uom_label || '').trim();
  if (label) return label;
  const code = String(line?.uom || 'ea').trim() || 'ea';
  const key = code.toLowerCase();
  if (key === 'box_es' || key === 'boxes') return 'Box (es)';
  if (code.includes('(') || /\s/.test(code)) return code;
  const human = labelFromMaterialUomCode(code);
  if (/_es$/i.test(code) && human) {
    return human.replace(/\s+Es$/i, ' (es)').replace(/\s+\(Es\)$/i, ' (es)');
  }
  return human || code;
}

export function warehouseNameToStoreroomLabel(nameOrLabel) {
  const raw = String(nameOrLabel || '').trim();
  if (!raw) return '';
  const idx = CARPENTRY_WAREHOUSE_NAMES.indexOf(raw);
  if (idx >= 0) return `Storeroom ${idx + 1}`;
  const match = raw.match(/carpentry\s+warehouse\s*(\d+)/i);
  if (match) return `Storeroom ${match[1]}`;
  if (/^storeroom\s+\d+/i.test(raw)) return raw.replace(/^storeroom/i, 'Storeroom');
  return raw;
}

/** @param {{ id: string, name?: string }[]} locations */
export function buildStoreroomLabelMap(locations) {
  const map = new Map();
  for (const row of locations || []) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const name = String(row.name || '').trim();
    map.set(id, warehouseNameToStoreroomLabel(name) || name || id);
  }
  return map;
}

export function storeroomLabelForMaterialLine(line, labelByLocationId) {
  const fromLine = String(line?.storeroom_label || '').trim();
  if (fromLine) return warehouseNameToStoreroomLabel(fromLine);
  const id = warehouseLocationIdFromStoredRow(line);
  if (id && labelByLocationId instanceof Map) {
    const hit = labelByLocationId.get(id);
    if (hit) return hit;
  }
  return '—';
}

export function materialLineDisplayName(line) {
  const name = String(line?.name || '').trim();
  if (name) return name;
  const sku = String(line?.family_sku || '').trim();
  if (sku) return sku;
  return '— (re-select material in app)';
}

export function formatMaterialLineQty(line) {
  const q = Math.max(0, Number(line?.quantity) || 0);
  const uom = humanizeJobMaterialUom(line);
  return `${q} ${uom}`;
}
