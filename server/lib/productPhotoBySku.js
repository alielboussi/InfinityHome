import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';
import { normalizeWarehouseSkuKey } from '../../src/utils/warehouseAssemblyMath.js';
import {
  expandWarehouseSkuMatchKeys,
  normalizeWarehouseProductSku,
} from '../../src/utils/warehouseScanResolver.js';

function publicSiteBase() {
  return String(
    process.env.INFINITY_PUBLIC_URL
    || process.env.REACT_APP_API_BASE
    || 'https://www.infinity-home.online',
  ).replace(/\/+$/, '');
}

/**
 * Stable QR URL printed on every production label (always encoded, even before a photo exists).
 * Scanning opens this link; when a catalog image exists for the same SKU it redirects to the photo.
 * Labels printed earlier keep working — the QR does not change when you add an image later.
 */
export function buildProductPhotoQrUrl(sku) {
  const clean = String(sku || '').trim();
  const base = publicSiteBase();
  if (!clean) return `${base}/api/health?action=product-photo`;
  return `${base}/api/health?action=product-photo&sku=${encodeURIComponent(clean)}`;
}

function pickImageUrl(product, imageRows) {
  if (!product) return '';
  const pid = String(product.id || '');
  const fromJoin = (imageRows || []).find((row) => String(row?.product_id) === pid);
  const raw = String(product.image_url || fromJoin?.image_url || '').trim();
  if (!raw) return '';
  return rewriteLegacyProductImageUrl(raw) || raw;
}

async function loadProductImageBySku(db, sku) {
  const clean = String(sku || '').trim();
  if (!clean) return '';
  const variants = [clean, clean.toUpperCase(), clean.toLowerCase()];
  let product = null;
  for (const candidate of variants) {
    const { data: products, error } = await db
      .from('products')
      .select('id, image_url, sku')
      .eq('sku', candidate)
      .limit(1);
    if (!error && Array.isArray(products) && products[0]) {
      product = products[0];
      break;
    }
  }
  if (!product) return '';
  const { data: images } = await db
    .from('product_images')
    .select('product_id, image_url')
    .eq('product_id', product.id)
    .limit(3);
  return pickImageUrl(product, images);
}

function assemblyImageUrl(assembly) {
  const candidates = [
    assembly?.image_url,
    assembly?.cover_image_url,
    assembly?.thumbnail_url,
    assembly?.photo_url,
  ];
  const raw = candidates.map((v) => String(v || '').trim()).find(Boolean) || '';
  if (!raw) return '';
  return rewriteLegacyProductImageUrl(raw) || raw;
}

function skuLookupCandidates(sku) {
  const clean = String(sku || '').trim();
  const out = new Set();
  if (!clean) return out;
  out.add(clean);
  out.add(clean.toUpperCase());
  out.add(clean.toLowerCase());
  const normalized = normalizeWarehouseProductSku(clean);
  if (normalized) {
    out.add(normalized);
    expandWarehouseSkuMatchKeys(normalized).forEach((k) => {
      if (k) out.add(k);
    });
  }
  return out;
}

async function loadWarehouseAssemblyImageByFamilySku(db, sku) {
  const candidates = skuLookupCandidates(sku);
  if (!candidates.size) return '';

  let sawAssemblyRow = false;
  for (const candidate of candidates) {
    const { data: rows, error } = await db
      .from('warehouse_assemblies')
      .select('id, family_sku, image_url, cover_image_url')
      .eq('family_sku', candidate)
      .limit(1);
    if (!error && Array.isArray(rows) && rows[0]) {
      sawAssemblyRow = true;
      const url = assemblyImageUrl(rows[0]);
      if (url) return url;
    }
  }

  if (sawAssemblyRow) return '';

  const targetKey = normalizeWarehouseSkuKey(
    normalizeWarehouseProductSku(sku) || String(sku || '').trim(),
  );
  if (!targetKey) return '';

  const { data: assemblies, error: listErr } = await db
    .from('warehouse_assemblies')
    .select('id, family_sku, image_url, cover_image_url');
  if (listErr || !Array.isArray(assemblies)) return '';

  const hit = assemblies.find(
    (row) => normalizeWarehouseSkuKey(row?.family_sku) === targetKey,
  );
  return assemblyImageUrl(hit);
}

async function loadAssemblyImageForPacket(db, packet) {
  if (!packet?.id) return '';
  let assemblyId = String(packet.assembly_id || '').trim();
  if (!assemblyId) {
    const { data: links } = await db
      .from('warehouse_assembly_packets')
      .select('assembly_id')
      .eq('packet_id', packet.id)
      .limit(1);
    assemblyId = String(links?.[0]?.assembly_id || '').trim();
  }
  if (!assemblyId) return '';
  const { data: assembly, error: aErr } = await db
    .from('warehouse_assemblies')
    .select('image_url, cover_image_url')
    .eq('id', assemblyId)
    .maybeSingle();
  if (aErr || !assembly) return '';
  return assemblyImageUrl(assembly);
}
async function loadWarehousePacketImageBySku(db, sku) {
  const candidates = skuLookupCandidates(sku);
  if (!candidates.size) return '';

  let packet = null;
  for (const candidate of candidates) {
    const { data: packets, error } = await db
      .from('warehouse_packets')
      .select('id, sku, assembly_id, image_url')
      .eq('sku', candidate)
      .limit(1);
    if (!error && Array.isArray(packets) && packets[0]) {
      packet = packets[0];
      break;
    }
  }
  if (!packet) return '';
  const direct = String(packet.image_url || '').trim();
  if (direct) return rewriteLegacyProductImageUrl(direct) || direct;
  return loadAssemblyImageForPacket(db, packet);
}

export async function resolveProductImageUrlForSku(db, sku) {
  const fromProduct = await loadProductImageBySku(db, sku);
  if (fromProduct) return fromProduct;
  const fromAssembly = await loadWarehouseAssemblyImageByFamilySku(db, sku);
  if (fromAssembly) return fromAssembly;
  return loadWarehousePacketImageBySku(db, sku);
}
