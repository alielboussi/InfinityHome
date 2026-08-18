import { SHOP_CART_STORAGE_KEY } from '../utils/shopConstants';
import { shopVariantCartKey } from '../utils/shopVariants';

const LEGACY_CART_STORAGE_KEY = 'infinity-shop:cart:v1';

export function readShopCart() {
  try {
    const raw = localStorage.getItem(SHOP_CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeShopCart(items) {
  try {
    localStorage.setItem(SHOP_CART_STORAGE_KEY, JSON.stringify(items || []));
    try { localStorage.removeItem(LEGACY_CART_STORAGE_KEY); } catch {}
  } catch {}
}

export function clearShopCart() {
  try {
    localStorage.removeItem(SHOP_CART_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
  } catch {}
}

export function addToShopCart(product, qty = 1, variant = null) {
  const amount = Math.max(1, Math.floor(Number(qty || 1)));
  const productId = String(product?.id || '');
  const variantId = String(variant?.id || product?.variantId || '').trim();
  const variantName = String(variant?.name || product?.variantName || '').trim();
  const hasVariants = Boolean(product?.hasVariants);
  if (hasVariants && !variantId) {
    throw new Error('Choose a variant before adding to cart');
  }

  const key = shopVariantCartKey(productId, variantId);
  const cart = readShopCart();
  const existing = cart.find((row) => String(row.id) === key);
  const maxQty = Math.max(0, Math.floor(Number(
    variant?.stockQty ?? variant?.stock_qty ?? product?.qty ?? 0,
  )));
  const nextQty = existing ? existing.quantity + amount : amount;
  const capped = maxQty > 0 ? Math.min(nextQty, maxQty) : nextQty;
  const imageUrl = variant?.imageUrls?.[0]
    || variant?.image_urls?.[0]
    || product?.imageUrls?.[0]
    || product?.imageUrl
    || '';
  const displayName = variantName
    ? `${product?.name || 'Product'} — ${variantName}`
    : (product?.name || 'Product');
  const line = {
    id: key,
    productId,
    variantId: variantId || null,
    variantName: variantName || null,
    sku: product?.sku || '',
    name: displayName,
    price: Number(product?.price || 0),
    currency: product?.currency || 'K',
    quantity: capped,
    imageUrl,
    maxQty,
  };
  const next = existing
    ? cart.map((row) => (String(row.id) === key ? { ...row, ...line } : row))
    : [...cart, line];
  writeShopCart(next);
  return next;
}

export function updateShopCartQty(lineId, quantity) {
  const id = String(lineId || '');
  const qty = Math.max(0, Math.floor(Number(quantity || 0)));
  const cart = readShopCart();
  if (qty <= 0) {
    const next = cart.filter((row) => String(row.id) !== id);
    writeShopCart(next);
    return next;
  }
  const next = cart.map((row) => {
    if (String(row.id) !== id) return row;
    const maxQty = Math.max(0, Math.floor(Number(row.maxQty || 0)));
    const capped = maxQty > 0 ? Math.min(qty, maxQty) : qty;
    return { ...row, quantity: capped };
  });
  writeShopCart(next);
  return next;
}

export function shopCartCount(cart = readShopCart()) {
  return (cart || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
}

export function shopCartTotal(cart = readShopCart()) {
  return (cart || []).reduce((sum, row) => sum + Number(row.price || 0) * Number(row.quantity || 0), 0);
}
