import db from '../dataClient';
import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';
import { normalizeWarehouseSkuKey } from '../utils/warehouseAssemblyMath';
import { normalizeWarehouseProductSku } from '../utils/warehouseScanResolver';
import { isWarehouseProductAssembly } from './warehouseCatalogHierarchy';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import { kitweQtyByAssembly } from './kitweSetStock';
import {
  saveWarehouseAssembly,
  setWarehouseAssemblyQuantity,
  WAREHOUSE_INVENTORY_MODE,
} from '../services/warehouseCatalog';
import { ensureRetailProductForKitweAssembly } from './kitweAssemblyRetailPricing';
import { upsertInventoryQuantity } from './inventoryApi';

export function assemblyEnabledAtKitwe(assemblyId, assemblyLocations) {
  return (assemblyLocations || []).some(
    (row) => String(row.assembly_id) === String(assemblyId)
      && String(row.location_id) === KITWE_LOCATION_ID,
  );
}

/** @deprecated Portal-wide list — use filterKitweFactoryDeliveredProducts on /kitwe-products */
export function listKitwePortalProductAssemblies(assemblies, assemblyInventory, assemblyLocations) {
  const qtyByAssembly = kitweQtyByAssembly(assemblyInventory);
  return (assemblies || [])
    .filter((a) => isWarehouseProductAssembly(a) && !isWarehouseSetAssembly(a))
    .filter((a) => {
      const aid = String(a.id);
      if ((qtyByAssembly.get(aid) ?? 0) > 0) return true;
      return assemblyEnabledAtKitwe(aid, assemblyLocations);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function findWarehouseAssemblyByFamilySku(familySku) {
  const key = normalizeWarehouseSkuKey(normalizeWarehouseProductSku(familySku));
  if (!key) return null;
  const { data, error } = await db.from('warehouse_assemblies').select('*');
  if (error) throw new Error(error.message || 'Failed to look up warehouse SKU');
  return (data || []).find(
    (row) => normalizeWarehouseSkuKey(row.family_sku) === key,
  ) || null;
}

/**
 * Mirror Kitwe portal product in central Warehouse catalog at 0 qty when SKU is new.
 */
export async function ensureFactoryWarehouseAssemblyForKitweSku({
  name,
  familySku,
  categoryId,
  warehouseLocationId,
}) {
  const sku = normalizeWarehouseProductSku(familySku);
  if (!sku) throw new Error('Product SKU is required.');
  if (!warehouseLocationId) throw new Error('Warehouse location is not configured.');

  const existing = await findWarehouseAssemblyByFamilySku(sku);
  if (existing) {
    await db.from('warehouse_assembly_locations').upsert({
      assembly_id: existing.id,
      location_id: KITWE_LOCATION_ID,
    }, { onConflict: 'assembly_id,location_id' });
    return { assembly: existing, createdInWarehouse: false };
  }

  const saved = await saveWarehouseAssembly({
    name,
    family_sku: sku,
    category_id: categoryId || null,
    inventory_mode: WAREHOUSE_INVENTORY_MODE.FINISHED,
    location_ids: [KITWE_LOCATION_ID],
    warehouse_location_id: warehouseLocationId,
    create_portal: 'kitwe-products',
  });

  await setWarehouseAssemblyQuantity(saved.id, warehouseLocationId, 0);

  const { data: fresh } = await db.from('warehouse_assemblies').select('*').eq('id', saved.id).maybeSingle();
  return { assembly: fresh || { ...saved, id: saved.id }, createdInWarehouse: true };
}

export async function setKitwePortalProductStock(assembly, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!assembly?.id) throw new Error('Product not found.');
  await setWarehouseAssemblyQuantity(assembly.id, KITWE_LOCATION_ID, qty);
  const retail = await ensureRetailProductForKitweAssembly(assembly);
  if (retail?.id) {
    await upsertInventoryQuantity({
      productId: retail.id,
      locationId: KITWE_LOCATION_ID,
      quantity: qty,
    });
  }
  return qty;
}

async function markAssemblyKitwePortalListed(assemblyId) {
  const id = String(assemblyId || '').trim();
  if (!id) return;
  const { data: row, error: readErr } = await db
    .from('warehouse_assemblies')
    .select('metadata')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || 'Failed to read product metadata');
  const prevMeta = row?.metadata || {};
  const now = new Date().toISOString();
  const { error } = await db.from('warehouse_assemblies').update({
    metadata: {
      ...prevMeta,
      kitwe_portal_listed: true,
      kitwe_portal_listed_at: prevMeta.kitwe_portal_listed_at || now,
    },
    updated_at: now,
  }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to mark Kitwe portal product');
}

export async function createKitwePortalProduct({
  name,
  familySku,
  categoryId,
  kitweQty,
  warehouseLocationId,
}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Product name is required.');

  const { assembly } = await ensureFactoryWarehouseAssemblyForKitweSku({
    name: trimmedName,
    familySku,
    categoryId,
    warehouseLocationId,
  });

  const qty = Math.max(0, Math.floor(Number(kitweQty) || 0));
  await setKitwePortalProductStock(assembly, qty);
  await markAssemblyKitwePortalListed(assembly.id);
  const { data: fresh } = await db.from('warehouse_assemblies').select('*').eq('id', assembly.id).maybeSingle();
  return fresh || assembly;
}
