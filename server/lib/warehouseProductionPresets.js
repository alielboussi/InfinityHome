import {
  PRODUCTION_CARPENTRY_PRESETS,
  PRODUCTION_SEATER_PRESETS,
} from '../../src/utils/productionItemName.js';
import { newUuid } from './uuid.js';

const TABLE = 'warehouse_production_presets';

export const PRODUCTION_PRESET_GROUP_SEATER = 'seater';
export const PRODUCTION_PRESET_GROUP_CARPENTRY = 'carpentry';

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueLabels(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((raw) => {
    const label = normalizeLabel(raw);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(label);
  });
  return out;
}

async function countPresetRows(sb) {
  const { count, error } = await sb
    .from(TABLE)
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message || 'Failed to count production presets');
  return Number(count) || 0;
}

export async function ensureProductionPresetsSeeded(sb) {
  const total = await countPresetRows(sb);
  if (total > 0) return false;
  const now = new Date().toISOString();
  const rows = [];
  let order = 0;
  for (const label of PRODUCTION_SEATER_PRESETS) {
    rows.push({
      id: newUuid(),
      group_key: PRODUCTION_PRESET_GROUP_SEATER,
      label,
      sort_order: order,
      active: true,
      created_at: now,
      updated_at: now,
    });
    order += 1;
  }
  order = 0;
  for (const label of PRODUCTION_CARPENTRY_PRESETS) {
    rows.push({
      id: newUuid(),
      group_key: PRODUCTION_PRESET_GROUP_CARPENTRY,
      label,
      sort_order: order,
      active: true,
      created_at: now,
      updated_at: now,
    });
    order += 1;
  }
  const { error } = await sb.from(TABLE).insert(rows);
  if (error) throw new Error(error.message || 'Failed to seed production presets');
  return true;
}

export async function listProductionPresetsGrouped(sb) {
  await ensureProductionPresetsSeeded(sb);
  const { data, error } = await sb
    .from(TABLE)
    .select('id, group_key, label, sort_order, active')
    .eq('active', true)
    .order('group_key', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load production presets');
  const seater = [];
  const carpentry = [];
  (data || []).forEach((row) => {
    const label = normalizeLabel(row.label);
    if (!label) return;
    if (String(row.group_key) === PRODUCTION_PRESET_GROUP_CARPENTRY) {
      carpentry.push(label);
    } else {
      seater.push(label);
    }
  });
  return {
    seater,
    carpentry,
    production_presets: { seater, carpentry },
  };
}

export async function saveProductionPresetsGrouped(sb, { seater = [], carpentry = [] } = {}) {
  const nextSeater = uniqueLabels(seater);
  const nextCarpentry = uniqueLabels(carpentry);
  if (!nextSeater.length && !nextCarpentry.length) {
    throw new Error('Add at least one preset in Seater or Carpentry.');
  }
  await ensureProductionPresetsSeeded(sb);
  const { data: existing, error: loadErr } = await sb
    .from(TABLE)
    .select('id, group_key, label, sort_order, active');
  if (loadErr) throw new Error(loadErr.message || 'Failed to load presets for save');
  const now = new Date().toISOString();
  const byKey = new Map(
    (existing || []).map((row) => [
      `${String(row.group_key)}::${normalizeLabel(row.label).toLowerCase()}`,
      row,
    ]),
  );

  const upsertGroup = async (groupKey, labels) => {
    let order = 0;
    for (const label of labels) {
      const mapKey = `${groupKey}::${label.toLowerCase()}`;
      const hit = byKey.get(mapKey);
      if (hit) {
        await sb.from(TABLE).update({
          label,
          group_key: groupKey,
          sort_order: order,
          active: true,
          updated_at: now,
        }).eq('id', hit.id);
      } else {
        await sb.from(TABLE).insert({
          id: newUuid(),
          group_key: groupKey,
          label,
          sort_order: order,
          active: true,
          created_at: now,
          updated_at: now,
        });
      }
      order += 1;
    }
  };

  await upsertGroup(PRODUCTION_PRESET_GROUP_SEATER, nextSeater);
  await upsertGroup(PRODUCTION_PRESET_GROUP_CARPENTRY, nextCarpentry);

  const keepKeys = new Set([
    ...nextSeater.map((l) => `${PRODUCTION_PRESET_GROUP_SEATER}::${l.toLowerCase()}`),
    ...nextCarpentry.map((l) => `${PRODUCTION_PRESET_GROUP_CARPENTRY}::${l.toLowerCase()}`),
  ]);
  for (const row of existing || []) {
    const label = normalizeLabel(row.label);
    const key = `${String(row.group_key)}::${label.toLowerCase()}`;
    if (!label || keepKeys.has(key)) continue;
    await sb.from(TABLE).update({ active: false, updated_at: now }).eq('id', row.id);
  }

  return listProductionPresetsGrouped(sb);
}

export async function loadProductionPresetIndex(sb) {
  const grouped = await listProductionPresetsGrouped(sb);
  const byLabel = new Map();
  grouped.seater.forEach((label) => byLabel.set(label.toLowerCase(), PRODUCTION_PRESET_GROUP_SEATER));
  grouped.carpentry.forEach((label) => byLabel.set(label.toLowerCase(), PRODUCTION_PRESET_GROUP_CARPENTRY));
  const all = [...grouped.seater, ...grouped.carpentry]
    .sort((a, b) => b.length - a.length);
  return { ...grouped, byLabel, all };
}

export function inferPresetLabelFromProductName(productName, presetLabelsSorted) {
  const n = normalizeLabel(productName);
  if (!n) return '';
  for (const preset of presetLabelsSorted || []) {
    const suffix = ` ${preset}`;
    if (n.endsWith(suffix) || n.toLowerCase() === preset.toLowerCase()) return preset;
  }
  return '';
}

export async function resolveProductionPresetGroupForProduct(sb, { preset, productName } = {}) {
  const { byLabel, all } = await loadProductionPresetIndex(sb);
  const explicit = normalizeLabel(preset);
  if (explicit && byLabel.has(explicit.toLowerCase())) {
    return byLabel.get(explicit.toLowerCase());
  }
  const inferred = inferPresetLabelFromProductName(productName, all);
  if (inferred && byLabel.has(inferred.toLowerCase())) {
    return byLabel.get(inferred.toLowerCase());
  }
  return PRODUCTION_PRESET_GROUP_SEATER;
}

export function whatsappKindForPresetGroup(groupKey) {
  return String(groupKey || '').toLowerCase() === PRODUCTION_PRESET_GROUP_CARPENTRY
    ? 'productionCarpentry'
    : 'production';
}

export async function buildProductionWhatsAppNotifyPayload(sb, base) {
  const group = await resolveProductionPresetGroupForProduct(sb, {
    preset: base.preset,
    productName: base.name,
  });
  return {
    ...base,
    preset_group: group,
    whatsapp_kind: whatsappKindForPresetGroup(group),
  };
}
