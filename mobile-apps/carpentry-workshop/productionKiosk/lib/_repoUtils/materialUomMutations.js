import {
  labelFromMaterialUomCode,
  normalizeMaterialUom,
  slugifyMaterialUomCode,
} from '../_repoConstants/carpentryUom.js';
import { newUuid } from './uuid.js';

const TABLE = 'warehouse_material_uoms';

export async function listMaterialUoms(sb) {
  const { data, error } = await sb
    .from(TABLE)
    .select('id, code, label, created_at')
    .order('label', { ascending: true });
  if (error) {
    if (/not found|does not exist/i.test(String(error.message || ''))) {
      return [];
    }
    throw new Error(error.message || 'Failed to load units of measure');
  }
  return (data || []).map((row) => ({
    id: row.id,
    code: slugifyMaterialUomCode(row.code),
    label: String(row.label || '').trim() || labelFromMaterialUomCode(row.code),
  })).filter((row) => row.code);
}

export function materialUomSelectOptions(rows) {
  return (rows || []).map((row) => ({
    value: row.code,
    label: row.label || row.code,
  }));
}

export async function createMaterialUom(sb, { code: codeInput, label: labelInput }) {
  const label = String(labelInput || '').trim();
  if (!label) throw new Error('Label is required');
  let code = slugifyMaterialUomCode(codeInput || label);
  if (!code) throw new Error('UOM code is required');
  const { data: existing, error: readErr } = await sb
    .from(TABLE)
    .select('id, code')
    .eq('code', code)
    .maybeSingle();
  if (readErr && !/not found|does not exist/i.test(String(readErr.message || ''))) {
    throw new Error(readErr.message || 'Failed to validate UOM code');
  }
  if (existing?.id) {
    throw new Error(`UOM code "${code}" already exists`);
  }
  const now = new Date().toISOString();
  const id = newUuid();
  const { data: created, error: insErr } = await sb.from(TABLE).insert({
    id,
    code,
    label,
    created_at: now,
    updated_at: now,
  }).select('id, code, label').single();
  if (insErr) throw new Error(insErr.message || 'Failed to create UOM');
  return {
    id: created.id,
    code: slugifyMaterialUomCode(created.code),
    label: created.label,
  };
}

export async function loadMaterialUomAllowedSet(sb) {
  const rows = await listMaterialUoms(sb);
  return new Set(rows.map((r) => r.code));
}

export async function normalizeMaterialUomOnServer(sb, raw) {
  const allowed = await loadMaterialUomAllowedSet(sb);
  return normalizeMaterialUom(raw, allowed.size ? allowed : undefined);
}
