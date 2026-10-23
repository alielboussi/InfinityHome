import { titleCaseWords } from './titleCaseWords';

export const PRODUCTION_SEAT_PRESETS = ['3 Seater', '2 Seater', 'Single Seater'];

/** Feminine names suited to luxury seating product lines. */
const PRODUCTION_RANDOM_GIRL_NAMES = Object.freeze([
  'Lara', 'Bella', 'Sienna', 'Aurora', 'Luna', 'Maya', 'Stella', 'Gia', 'Nina', 'Carmen',
  'Lucia', 'Valentina', 'Aria', 'Nova', 'Cleo', 'Elise', 'Giselle', 'Helena', 'Jade', 'Kiara',
  'Lena', 'Mila', 'Noa', 'Olivia', 'Rosa', 'Sabrina', 'Talia', 'Vera', 'Zara', 'Amara',
  'Bianca', 'Celeste', 'Dahlia', 'Elena', 'Freya', 'Isla', 'Jasmine', 'Kira', 'Layla', 'Monroe',
]);

/** Short, evocative place names (single product title). */
const PRODUCTION_RANDOM_PLACE_NAMES = Object.freeze([
  'Capri', 'Como', 'Positano', 'Santorini', 'Riviera', 'Monaco', 'Maldives', 'Bali', 'Maui', 'Tahiti',
  'Aspen', 'Florence', 'Vienna', 'Lucerne', 'Mykonos', 'Amalfi', 'Portofino', 'Venice', 'Seychelles', 'Bora',
  'Kyoto', 'Savannah', 'Ibiza', 'Cannes', 'Dubai', 'Geneva', 'Nice', 'Sorrento', 'Zurich', 'St Tropez',
  'Havana', 'Lisbon', 'Marrakech', 'Paros', 'Phuket', 'Sicily', 'Tuscany', 'Verona', 'Zanzibar', 'Corfu',
]);

export function pickRandomProductionBaseName() {
  const usePlace = Math.random() < 0.4;
  const raw = usePlace
    ? pickFromPool(PRODUCTION_RANDOM_PLACE_NAMES)
    : pickFromPool(PRODUCTION_RANDOM_GIRL_NAMES);
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

/** Suggest a base name (girl name or beautiful place) for production seating. */
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
  if (!base) return '';
  if (!p) return base;
  return `${base} ${p}`;
}
