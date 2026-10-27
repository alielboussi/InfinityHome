import { createFirestoreServerClient } from './firestoreServerClient.js';
import { attachProductionAssemblyCatalogPhoto } from './productionPacketCatalogPhoto.js';
import { evaluateWarehouseProductionAppAccess } from '../../src/mobile/mobileAccessManifest.js';
import { getLoginAccessRecord } from './loginAccess.js';
import { normalizeMobileAccessGrant } from './mobileAccessDefaults.js';

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

async function assertProductionKioskUser(user) {
  const record = await getLoginAccessRecord(user?.id);
  const grant = normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
  if (evaluateWarehouseProductionAppAccess(grant, user?.email)) {
    return grant;
  }
  const err = new Error('You do not have access to warehouse production.');
  err.status = 403;
  throw err;
}

/**
 * AI catalog photo for a finished warehouse product (Gemini retouch + storage + assembly image_url).
 */
export async function runProductionAssemblyPhotoAttach(body, user) {
  await assertProductionKioskUser(user);
  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  const requireAi = body.require_ai_retouch === true
    || body.requireAiRetouch === true
    || String(body.client_source || '').trim() === 'warehouse_production_app';
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!imageBase64) throw new Error('Product photo is required.');

  const { data: assembly, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, inventory_mode, image_url')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!assembly) throw new Error('Product not found.');
  if (String(assembly.inventory_mode || '').toLowerCase() !== 'finished') {
    throw new Error('Photos can only be attached to finished warehouse products.');
  }

  const catalogImageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
    assembly,
    imageBase64,
    productName: assembly.name,
    skipAiRetouch: false,
    requireAiRetouch: requireAi,
  });

  return {
    assembly_id: assemblyId,
    catalog_image_url: catalogImageUrl,
    assembly: { ...assembly, image_url: catalogImageUrl },
  };
}
