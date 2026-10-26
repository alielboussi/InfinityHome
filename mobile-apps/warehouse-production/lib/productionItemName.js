import { titleCaseWords } from './titleCaseWords';

export const PRODUCTION_SEAT_PRESETS = ['3 Seater', '2 Seater', 'Single Seater', 'Lounge Chair'];

/** Keep in sync with src/utils/productionItemName.js — girl names only. */
const PRODUCTION_GIRL_NAME_POOL = Object.freeze([
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

function pickFromPool(pool) {
  if (!pool.length) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickRandomProductionBaseName() {
  return normalizeProductionNameInput(pickFromPool(PRODUCTION_GIRL_NAME_POOL));
}

export async function fetchUniqueRandomProductionBaseName(checkNameTaken) {
  if (typeof checkNameTaken !== 'function') {
    return pickRandomProductionBaseName();
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = pickRandomProductionBaseName();
    const taken = await checkNameTaken(candidate);
    if (!taken) return candidate;
  }
  throw new Error('Could not find an unused name. Enter one manually.');
}

export function normalizeProductionNameInput(text) {
  return titleCaseWords(String(text || '').trim());
}

export function normalizeWarehousePacketNameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildProductionItemName(baseName, preset) {
  const base = normalizeProductionNameInput(baseName);
  const p = String(preset || '').trim();
  if (!base) return '';
  if (!p) return base;
  return `${base} ${p}`;
}
