/**
 * Ensure every default Production preset has a matching /categories row (see productionPresetCategory.js).
 *
 * Usage: node scripts/ensureProductionPresetCategories.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { newUuid } = await import('../server/lib/uuid.js');
  const { listProductionPresetsGrouped } = await import('../server/lib/warehouseProductionPresets.js');
  const { warehouseCategoryNameForProductionPreset } = await import('../src/utils/productionPresetCategory.js');

  const sb = createFirestoreServerClient();
  if (!sb) {
    throw new Error('Firebase admin not configured — set credentials in .env.local');
  }

  async function ensureCategory(categoryName) {
    const name = String(categoryName || '').trim();
    if (!name) return null;
    const { data: existingRows, error: fetchErr } = await sb.from('categories').select('id, name');
    if (fetchErr) throw new Error(fetchErr.message || 'Failed to load categories');
    const match = (existingRows || []).find(
      (c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (match) return match;
    const id = newUuid();
    const now = new Date().toISOString();
    const row = { id, name, created_at: now, updated_at: now };
    const { error } = await sb.from('categories').insert(row);
    if (error) throw new Error(error.message || 'Failed to create category');
    return row;
  }

  const grouped = await listProductionPresetsGrouped(sb);
  const presets = [...grouped.seater, ...grouped.carpentry];
  const seen = new Set();

  for (const preset of presets) {
    const key = String(preset || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const categoryName = warehouseCategoryNameForProductionPreset(preset);
    const row = await ensureCategory(categoryName);
    console.log(`  [ok] ${preset} → "${categoryName}" (${row?.id})`);
  }

  console.log(`ensureProductionPresetCategories: ${seen.size} preset categories ready`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
