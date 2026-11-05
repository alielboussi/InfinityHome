import db from '../dataClient';
import {
  KITWE_CATALOG_LOOSE_META,
  mergeAssemblyMetadataPatch,
} from './kitweCatalogComponentVisibility.js';

export async function patchWarehouseAssemblyMetadata(assemblyId, patch) {
  const id = String(assemblyId || '').trim();
  if (!id) return;
  const { data: row, error: readErr } = await db
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read assembly metadata');
  const metadata = mergeAssemblyMetadataPatch(row?.metadata, patch);
  const { error: updErr } = await db
    .from('warehouse_assemblies')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) throw new Error(updErr.message || 'Failed to update assembly metadata');
}

/** Mark components as sellable individually on Kitwe catalog (e.g. POS set partial sale). */
export async function markKitweCatalogLoose(assemblyIds) {
  const ids = [...new Set((assemblyIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  await Promise.all(
    ids.map((id) => patchWarehouseAssemblyMetadata(id, { [KITWE_CATALOG_LOOSE_META]: true })),
  );
}

/** Clear loose flag when a product is bundled into a Kitwe set again. */
export async function clearKitweCatalogLoose(assemblyIds) {
  const ids = [...new Set((assemblyIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  await Promise.all(
    ids.map((id) => patchWarehouseAssemblyMetadata(id, { [KITWE_CATALOG_LOOSE_META]: undefined })),
  );
}
