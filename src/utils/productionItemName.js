import { titleCaseWords } from './titleCaseWords.js';

export const PRODUCTION_SEATER_PRESETS = Object.freeze([
  '3 Seater',
  '2 Seater',
  'Single Seater',
  'Lounge Chair',
  'Curtains',
  'Pillows',
]);

export const PRODUCTION_CARPENTRY_PRESETS = Object.freeze([
  'Coffee Table',
  'Side Table',
  'Dining Table',
  'Dining Chair',
  'Buffet',
  'Buffet Mirror',
  'Dresser Table',
  'Dresser Mirror',
]);

/** Older labels still in the catalog — strip base name only. */
export const PRODUCTION_LEGACY_PRESET_SUFFIXES = Object.freeze([
  'Dresser Table Mirror',
]);

export const PRODUCTION_ITEM_PRESETS = Object.freeze([
  ...PRODUCTION_SEATER_PRESETS,
  ...PRODUCTION_CARPENTRY_PRESETS,
]);

/** @deprecated use PRODUCTION_ITEM_PRESETS */
export const PRODUCTION_SEAT_PRESETS = PRODUCTION_ITEM_PRESETS;

export function isProductionSeaterPreset(preset) {
  return PRODUCTION_SEATER_PRESETS.includes(String(preset || '').trim());
}

export function isProductionCarpentryPreset(preset) {
  return PRODUCTION_CARPENTRY_PRESETS.includes(String(preset || '').trim());
}

/** Curated feminine given names (worldwide) — AI and random suggest must pick from this pool only. */
export const PRODUCTION_GIRL_NAME_POOL = Object.freeze([
  'Aisha', 'Amara', 'Anika', 'Aria', 'Aurora', 'Ayla', 'Bella', 'Bianca', 'Carmen', 'Celeste',
  'Chiara', 'Cleo', 'Dahlia', 'Elena', 'Elise', 'Esme', 'Fatima', 'Freya', 'Gia', 'Giselle',
  'Hana', 'Helena', 'Ines', 'Isla', 'Jade', 'Jasmine', 'Kiara', 'Kira', 'Lara', 'Layla',
  'Leila', 'Lena', 'Lucia', 'Luna', 'Maya', 'Meera', 'Mila', 'Nadia', 'Nina', 'Noa',
  'Nova', 'Olivia', 'Priya', 'Rosa', 'Sabrina', 'Saoirse', 'Sienna', 'Stella', 'Talia', 'Valentina',
  'Vera', 'Yuki', 'Zara', 'Zuri', 'Amira', 'Anya', 'Dina', 'Elin', 'Farah', 'Hira',
  'Imani', 'Jana', 'Keira', 'Laila', 'Mariam', 'Nia', 'Rania', 'Sana', 'Tara', 'Yasmin',
]);

const GIRL_NAME_BY_KEY = Object.freeze(
  Object.fromEntries(PRODUCTION_GIRL_NAME_POOL.map((n) => [n.toLowerCase(), n])),
);

export function matchProductionGirlNameFromPool(raw) {
  const normalized = normalizeProductionNameInput(String(raw || '').trim());
  if (!normalized) return null;
  const hit = GIRL_NAME_BY_KEY[normalized.toLowerCase()];
  return hit ? normalizeProductionNameInput(hit) : null;
}

/** @returns {string} canonical pool name */
export function requireProductionGirlBaseName(raw) {
  const hit = matchProductionGirlNameFromPool(raw);
  if (!hit) {
    throw new Error('Name must be a feminine first name from the production name list.');
  }
  return hit;
}

export function pickRandomProductionBaseName() {
  const raw = pickFromPool(PRODUCTION_GIRL_NAME_POOL);
  return normalizeProductionNameInput(raw);
}

function pickFromPool(pool) {
  const list = pool;
  if (!list.length) return '';
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : null;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint32Array(1);
    cryptoObj.getRandomValues(bytes);
    return list[bytes[0] % list.length];
  }
  return list[Math.floor(Math.random() * list.length)];
}

/** Suggest a base name (girl name only) for production seating. */
export async function fetchRandomFemaleFirstName() {
  return pickRandomProductionBaseName();
}

/**
 * Pick a random base name that passes `checkNameTaken` (full or base name).
 * @param {(name: string) => Promise<boolean>} checkNameTaken — return true if unavailable
 */
export async function fetchUniqueRandomProductionBaseName(checkNameTaken) {
  if (typeof checkNameTaken !== 'function') {
    return pickRandomProductionBaseName();
  }
  for (let attempt = 0; attempt < 35; attempt += 1) {
    const candidate = pickRandomProductionBaseName();
    const taken = await checkNameTaken(candidate);
    if (!taken) return candidate;
  }
  throw new Error('Could not find an unused name. Enter one manually.');
}

export function normalizeWarehousePacketNameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Title-case each word; digits in words are preserved (e.g. 3 Seater). */
export function normalizeProductionNameInput(text) {
  return titleCaseWords(String(text || '').trim());
}

export function buildProductionItemName(baseName, preset) {
  const base = normalizeProductionNameInput(baseName);
  const p = String(preset || '').trim();
  if (!base) return base;
  if (!p) return base;
  return `${base} ${p}`;
}

function allPresetSuffixes() {
  return [...PRODUCTION_ITEM_PRESETS, ...PRODUCTION_LEGACY_PRESET_SUFFIXES]
    .sort((a, b) => b.length - a.length);
}

/** Strip product-type suffix to get the line base name. */
export function extractProductionBaseName(productName) {
  const n = normalizeProductionNameInput(productName);
  if (!n) return '';
  for (const preset of allPresetSuffixes()) {
    const suffix = ` ${preset}`;
    if (n.endsWith(suffix)) {
      return n.slice(0, -suffix.length).trim();
    }
  }
  return n;
}
