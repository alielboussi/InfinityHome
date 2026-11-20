/**
 * Hassan quote catalog — fixed units of measure (no per-user unit admin on Quote Products).
 */
export const HASSAN_QUOTE_UNIT_SPECS = [
  { name: 'Pieces', abbreviation: 'Pc(s)', label: 'Pc(s)' },
  { name: 'MetersSquared', abbreviation: 'm²', label: 'm²' },
];

const SPEC_BY_NAME = new Map(
  HASSAN_QUOTE_UNIT_SPECS.map((spec) => [String(spec.name).trim().toLowerCase(), spec]),
);

function compactUnitName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function compactAbbreviation(abbr) {
  return String(abbr || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/²/g, '2')
    .replace(/[^a-z0-9]/g, '');
}

/** Match DB row to one of the two fixed Hassan specs (name or abbreviation). */
export function hassanQuoteUnitMatchesSpec(spec, row) {
  if (!spec || !row?.id) return false;
  const rowName = String(row.name || '').trim();
  if (rowName.toLowerCase() === String(spec.name).toLowerCase()) return true;

  const rowKey = compactUnitName(rowName);
  const specKey = compactUnitName(spec.name);
  const abbrKey = compactAbbreviation(row.abbreviation);

  if (spec.name === 'MetersSquared') {
    if (rowKey === specKey) return true;
    if (
      rowKey.includes('metersquared')
      || rowKey.includes('metresquared')
      || rowKey.includes('squaremeter')
      || rowKey.includes('squaremetre')
    ) return true;
    if (abbrKey === 'm2' || abbrKey === 'sqm' || abbrKey === 'sq' || /^m2?$/.test(abbrKey)) return true;
    if (String(row.abbreviation || '').includes('²')) return true;
  }

  if (spec.name === 'Pieces') {
    if (rowKey === specKey || rowKey.includes('piece')) return true;
    if (abbrKey === 'pcs' || abbrKey === 'pc' || abbrKey.includes('pcs')) return true;
  }

  return false;
}

/** Short label in Hassan quote UI (not DB `name`). */
export function hassanQuoteUnitDisplayLabel(unit) {
  if (!unit) return '';
  for (const spec of HASSAN_QUOTE_UNIT_SPECS) {
    if (hassanQuoteUnitMatchesSpec(spec, unit)) return spec.label;
  }
  const key = String(unit?.name || '').trim().toLowerCase();
  const spec = SPEC_BY_NAME.get(key);
  if (spec?.label) return spec.label;
  const abbr = String(unit?.abbreviation || '').trim();
  if (abbr) return abbr;
  return String(unit?.name || '').trim();
}

/** Specs with no matching quotation_units row yet. */
export function missingHassanQuoteUnitSpecs(units) {
  const rows = Array.isArray(units) ? units : [];
  return HASSAN_QUOTE_UNIT_SPECS.filter(
    (spec) => !rows.some((row) => hassanQuoteUnitMatchesSpec(spec, row)),
  );
}

/** Keep only the two Hassan quote UOMs, in catalog order; requires matching quotation_units rows. */
export function filterHassanQuoteUnits(units) {
  const rows = Array.isArray(units) ? units : [];
  const used = new Set();
  const out = [];
  for (const spec of HASSAN_QUOTE_UNIT_SPECS) {
    const row = rows.find(
      (candidate) => candidate?.id
        && !used.has(String(candidate.id))
        && hassanQuoteUnitMatchesSpec(spec, candidate),
    );
    if (row) {
      used.add(String(row.id));
      out.push(row);
    }
  }
  return out;
}

export function isHassanQuoteUnitName(name) {
  return SPEC_BY_NAME.has(String(name || '').trim().toLowerCase());
}