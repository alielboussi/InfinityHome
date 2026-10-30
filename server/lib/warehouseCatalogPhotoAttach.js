import { createFirestoreServerClient } from './firestoreServerClient.js';
import { attachProductionAssemblyCatalogPhoto } from './productionPacketCatalogPhoto.js';
import { getGeminiCatalogPhotoApiKey } from './geminiImageEmbedding.js';
import { canManageCatalog } from '../../src/accessControl.js';
import { getLoginAccessRecord, isLoginAccessAdmin } from './loginAccess.js';
import { normalizeMobileAccessGrant } from './mobileAccessDefaults.js';
import { isMobileScreenAccessAllowed } from '../../src/mobile/mobileAccessManifest.js';
import { rewriteLegacyProductImageUrl } from '../../src/utils/storageImageUrl.js';

const MAX_IMAGE_BASE64_CHARS = 3_200_000;

function getService() {
  const client = createFirestoreServerClient();
  if (!client) throw new Error('Firebase admin not configured');
  return client;
}

async function assertCatalogPhotoUser(user) {
  if (canManageCatalog(user) || isLoginAccessAdmin(user?.email)) return;
  const record = await getLoginAccessRecord(user?.id);
  const grant = normalizeMobileAccessGrant(record?.mobile_access || {}, user?.email);
  if (isMobileScreenAccessAllowed(grant, 'warehouse_product_form')) return;
  const err = new Error('You do not have permission to upload catalog product photos.');
  err.status = 403;
  throw err;
}

/**
 * AI catalog photo for warehouse-catalog mobile (Gemini retouch + assembly image_url).
 */
export async function runCatalogAssemblyPhotoAttach(body, user) {
  await assertCatalogPhotoUser(user);
  if (!getGeminiCatalogPhotoApiKey()) {
    throw new Error('GEMINI_API_KEY_CATALOG or GEMINI_API_KEY is not configured on the server.');
  }

  const sb = getService();
  const assemblyId = String(body.assembly_id || body.assemblyId || '').trim();
  const imageBase64 = String(body.image_base64 || body.imageBase64 || '').trim();
  const forceReupload = body.force_reupload === true || body.forceReupload === true;
  if (!assemblyId) throw new Error('assembly_id is required.');
  if (!imageBase64) throw new Error('Product photo is required.');
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new Error('Photo is too large. Retake the picture or move closer and try again.');
  }

  const { data: assembly, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, inventory_mode, image_url')
    .eq('id', assemblyId)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load product');
  if (!assembly) throw new Error('Product not found.');

  const existingUrl = String(assembly.image_url || '').trim();
  if (!forceReupload && existingUrl) {
    const catalogImageUrl = rewriteLegacyProductImageUrl(existingUrl) || existingUrl;
    return {
      assembly_id: assemblyId,
      catalog_image_url: catalogImageUrl,
      assembly: { ...assembly, image_url: catalogImageUrl },
      idempotent: true,
    };
  }

  const catalogImageUrl = await attachProductionAssemblyCatalogPhoto(sb, {
    assembly,
    imageBase64,
    productName: assembly.name,
    skipAiRetouch: false,
    requireAiRetouch: true,
    resolveApiKey: getGeminiCatalogPhotoApiKey,
  });

  const { data: refreshed } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku, inventory_mode, image_url')
    .eq('id', assemblyId)
    .maybeSingle();

  return {
    assembly_id: assemblyId,
    catalog_image_url: catalogImageUrl,
    assembly: refreshed || { ...assembly, image_url: catalogImageUrl },
  };
}
