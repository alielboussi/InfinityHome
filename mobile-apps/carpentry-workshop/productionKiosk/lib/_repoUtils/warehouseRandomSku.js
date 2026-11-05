/** Random warehouse SKU helpers (web + server). */

export const WAREHOUSE_RANDOM_SKU_LENGTH = 16;

const RANDOM_SKU_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 16-character SKU using uppercase letters and digits. */
export function generateRandomWarehouseSku16() {
  let out = '';
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : null;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(WAREHOUSE_RANDOM_SKU_LENGTH);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < WAREHOUSE_RANDOM_SKU_LENGTH; i += 1) {
      out += RANDOM_SKU_CHARS[bytes[i] % RANDOM_SKU_CHARS.length];
    }
    return out;
  }
  for (let i = 0; i < WAREHOUSE_RANDOM_SKU_LENGTH; i += 1) {
    out += RANDOM_SKU_CHARS[Math.floor(Math.random() * RANDOM_SKU_CHARS.length)];
  }
  return out;
}
