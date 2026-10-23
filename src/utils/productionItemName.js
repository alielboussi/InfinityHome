import { titleCaseWords } from './titleCaseWords';

export const PRODUCTION_SEAT_PRESETS = ['3 Seater', '2 Seater', 'Single Seater'];

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

export async function fetchRandomFemaleFirstName() {
  const res = await fetch(
    'https://randomuser.me/api/?gender=female&inc=name&nat=gb,us,au,ie,nz,ca',
  );
  if (!res.ok) throw new Error('Could not fetch a name from the internet.');
  const json = await res.json();
  const first = json?.results?.[0]?.name?.first;
  if (!first) throw new Error('No name was returned. Try again.');
  return normalizeProductionNameInput(first);
}
