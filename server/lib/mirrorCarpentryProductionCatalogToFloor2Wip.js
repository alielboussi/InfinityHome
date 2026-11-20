import { mergeWarehouseFloor2WipImageMetadata, readWarehouseFloor2WipImageUrl } from '../../src/utils/warehouseFloor2WipImage.js';

function pendingPortalSetup(body) {
  return body?.pending_portal_setup || body?.pendingPortalSetup || null;
}

function isCarpentryProductionContext(body, portalResult) {
  if (portalResult?.applied === 'carpentry') return true;
  const pending = pendingPortalSetup(body);
  const portal = String(pending?.portal_catalog || pending?.portalCatalog || '').toLowerCase();
  if (portal === 'carpentry') return true;
  const client = String(
    body?.client_source
    || body?.clientSource
    || pending?.client_source
    || pending?.clientSource
    || '',
  ).trim();
  return client === 'carpentry_workshop_app';
}

/**
 * Carpentry production attaches AI catalog photos to image_url (WhatsApp + Floor 1).
 * Floor 2 grid reads metadata.floor2_wip_image_url — mirror catalog when WIP is still empty.
 */
export async function mirrorCarpentryProductionCatalogToFloor2Wip(
  sb,
  assemblyId,
  catalogImageUrl,
  { body, portalResult } = {},
) {
  const url = String(catalogImageUrl || '').trim();
  const aid = String(assemblyId || '').trim();
  if (!url || !aid) return { mirrored: false };
  if (!isCarpentryProductionContext(body, portalResult)) return { mirrored: false };

  const { data: row, error: loadErr } = await sb
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', aid)
    .maybeSingle();
  if (loadErr) throw new Error(loadErr.message || 'Failed to load assembly for Floor 2 photo');

  if (readWarehouseFloor2WipImageUrl(row || {})) {
    return { mirrored: false, skipped: 'wip_exists' };
  }

  const metadata = mergeWarehouseFloor2WipImageMetadata(row?.metadata, url);
  const { error: saveErr } = await sb.from('warehouse_assemblies').update({
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', aid);
  if (saveErr) throw new Error(saveErr.message || 'Failed to save Floor 2 WIP photo from catalog');

  return { mirrored: true, floor2_wip_image_url: url };
}