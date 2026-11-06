import { LUSAKA_BRANCH_ID } from './locationIds';

export const SHOP_LOCATION_ID = LUSAKA_BRANCH_ID;
export const SHOP_IMAGE_BUCKET = 'productimages';
export const SHOP_IMAGE_PREFIX = 'shop/products';
export const SHOP_CART_STORAGE_KEY = 'infinity-shop:cart:v2';

/** E.164 digits only for wa.me links (e.g. 260971234567). Set in .env.local */
export const SHOP_WHATSAPP_E164 = String(
  process.env.REACT_APP_SHOP_WHATSAPP_E164 || process.env.REACT_APP_SHOP_WHATSAPP_PHONE || '',
).replace(/\D/g, '');

export function isShopPublicPath(path) {
  const raw = String(path || '').split('?')[0].split('#')[0];
  let p = raw;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p === '/shop' || p.startsWith('/shop/');
}

export function buildShopWhatsAppUrl({ productName, sku } = {}) {
  const phone = SHOP_WHATSAPP_E164;
  if (!phone) return '';
  const bits = ['Hi, I would like to enquire about'];
  if (productName) bits.push(String(productName).trim());
  if (sku) bits.push(`(SKU: ${String(sku).trim()})`);
  const text = encodeURIComponent(bits.join(' '));
  return `https://wa.me/${phone}?text=${text}`;
}
