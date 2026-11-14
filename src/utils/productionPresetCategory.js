/**
 * Maps Production app preset labels to warehouse /categories names.
 * Unmapped presets use the preset label as the category name (created on first production save).
 */
export const PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET = Object.freeze({
  '3 Seater': '3 Seaters',
  '2 Seater': '2 Seaters',
  'Single Seater': 'Single Seaters',
  'Lounge Chair': 'Lounge Chairs',
  Curtains: 'Curtains',
  Pillows: 'Pillows',
  'Coffee Table': 'Coffee Tables',
  'Side Table': 'Side Tables',
  'Dining Table': 'Dining Tables',
  'Dining Chair': 'Dining Chairs',
  Buffet: 'Buffets',
  'Buffet Mirror': 'Buffet Mirrors',
  'Dresser Table': 'Dresser Tables',
  'Dresser Mirror': 'Dresser Table Mirrors',
  Consoles: 'Consoles',
  'Console Mirrors': 'Console Mirrors',
});

const PRESET_CATEGORY_BY_LOWER = Object.freeze(
  Object.fromEntries(
    Object.entries(PRODUCTION_PRESET_WAREHOUSE_CATEGORY_BY_PRESET).map(([preset, category]) => [
      preset.toLowerCase(),
      category,
    ]),
  ),
);

export function warehouseCategoryNameForProductionPreset(preset) {
  const label = String(preset || '').trim().replace(/\s+/g, ' ');
  if (!label) return '';
  const mapped = PRESET_CATEGORY_BY_LOWER[label.toLowerCase()];
  if (mapped) return mapped;
  return label;
}
