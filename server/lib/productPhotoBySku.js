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

import { LABEL_PHOTO_FLOOR2, normalizeLabelPhotoFloor } from './warehouseLabelPhotoFloor.js';
import { readWarehouseFloor2WipImageUrl } from '../../src/utils/warehouseFloor2WipImage.js';

/**
 * Stable QR URL printed on warehouse production labels (always encoded, even before a photo exists).
 * Scanning opens this link; redirects to Floor 1 catalog image or Floor 2 WIP per `photoFloor`.
 */
export function buildProductPhotoQrUrl(sku, { photoFloor } = {}) {
  const clean = String(sku || '').trim();
  const base = publicSiteBase();
  const floor = normalizeLabelPhotoFloor(photoFloor);
  const params = new URLSearchParams({ action: 'product-photo' });
  if (clean) params.set('sku', clean);
  if (floor === LABEL_PHOTO_FLOOR2) params.set('floor', '2');
  return `${base}/api/health?${params.toString()}`;
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

async function findWarehouseAssemblyByFamilySku(db, sku) {
  const candidates = skuLookupCandidates(sku);
  if (!candidates.size) return null;

  for (const candidate of candidates) {
    const { data: rows, error } = await db
      .from('warehouse_assemblies')
      .select('id, family_sku, image_url, cover_image_url, metadata')
      .eq('family_sku', candidate)
      .limit(1);
    if (!error && Array.isArray(rows) && rows[0]) {
      return rows[0];
    }
  }

  const targetKey = normalizeWarehouseSkuKey(
    normalizeWarehouseProductSku(sku) || String(sku || '').trim(),
  );
  if (!targetKey) return null;

  const { data: assemblies, error: listErr } = await db
    .from('warehouse_assemblies')
    .select('id, family_sku, image_url, cover_image_url, metadata');
  if (listErr || !Array.isArray(assemblies)) return null;

  return assemblies.find(
    (row) => normalizeWarehouseSkuKey(row?.family_sku) === targetKey,
  ) || null;
}

async function loadWarehouseAssemblyImageByFamilySku(db, sku) {
  const assembly = await findWarehouseAssemblyByFamilySku(db, sku);
  return assemblyImageUrl(assembly);
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

async function loadWarehouseFloor2WipImageByFamilySku(db, sku) {
  const assembly = await findWarehouseAssemblyByFamilySku(db, sku);
  if (!assembly) return '';
  const wip = readWarehouseFloor2WipImageUrl(assembly);
  if (!wip) return '';
  return rewriteLegacyProductImageUrl(wip) || wip;
}

export async function resolveProductImageUrlForSku(db, sku, { photoFloor } = {}) {
  const floor = normalizeLabelPhotoFloor(photoFloor);
  if (floor === LABEL_PHOTO_FLOOR2) {
    const fromWip = await loadWarehouseFloor2WipImageByFamilySku(db, sku);
    if (fromWip) return fromWip;
    return '';
  }
  const fromProduct = await loadProductImageBySku(db, sku);
  if (fromProduct) return fromProduct;
  const fromAssembly = await loadWarehouseAssemblyImageByFamilySku(db, sku);
  if (fromAssembly) return fromAssembly;
  return loadWarehousePacketImageBySku(db, sku);
}
