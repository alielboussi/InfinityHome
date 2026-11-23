/**
 * Zambia mobile numbers: 9 digits after country code (+260).
 * Congo (+243) is not validated here.
 */

export const ZAMBIA_NATIONAL_PHONE_DIGITS = 9;

export function stripPhoneToDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function zambiaNationalDigits(raw, prefix = '') {
  let digits = stripPhoneToDigits(raw);
  const prefixDigits = stripPhoneToDigits(prefix);
  if (prefixDigits && digits.startsWith(prefixDigits)) {
    digits = digits.slice(prefixDigits.length);
  } else if (digits.startsWith('260')) {
    digits = digits.slice(3);
  }
  return digits;
}

export function isZambiaPhonePrefix(prefix, raw = '') {
  const p = String(prefix || '').trim();
  if (p.includes('243')) return false;
  if (p.includes('260') || p === '+260') return true;
  const digits = stripPhoneToDigits(raw);
  if (digits.startsWith('243')) return false;
  if (digits.startsWith('260')) return true;
  return !p || p === '+' || p.includes('260');
}

export function zambiaPhoneErrorMessage() {
  return 'A Zambian phone number has 9 digits excluding the country code.';
}

/** Throws if Zambia national number is not exactly 9 digits. */
export function assertZambiaNationalPhone(raw, prefix = '+260') {
  if (!isZambiaPhonePrefix(prefix, raw)) return zambiaNationalDigits(raw, prefix);
  const national = zambiaNationalDigits(raw, prefix);
  if (national.length !== ZAMBIA_NATIONAL_PHONE_DIGITS) {
    const err = new Error(zambiaPhoneErrorMessage());
    err.code = 'zambia_phone_digits';
    throw err;
  }
  return national;
}
