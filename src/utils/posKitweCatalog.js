import db from '../dataClient';
import { KITWE_LOCATION_ID } from '../constants/warehouseShowroomLocations';
import { isWarehouseSetAssembly } from './warehouseSetMath';
import {
  computeKitweSetBuildableQty,
  kitweQtyByAssembly,
} from './kitweSetStock';
import { expandWarehouseSetItemsRows } from './warehouseSetItems';
import {
  applyKitweAssemblyPosPricing,
  loadRetailProductsForAssemblies,
  resolveRetailProductForAssembly,
} from './kitweAssemblyRetailPricing';
import { buildProductLocationPriceMap } from './locationPricing';

/**
 * Warehouse assemblies with Kitwe assembly_inventory — products + sets for POS at Kitwe.
 */
export async function fetchKitweWarehousePosCatalog(locationId, options = {}) {
  const locId = String(locationId || KITWE_LOCATION_ID);
  const productLocationPriceMap = options.productLocationPriceMap
    || buildProductLocationPriceMap(options.productLocationPrices || []);

  const [
    { data: assemblies, error: aErr },
    { data: inv, error: iErr },
    { data: setItems, error: sErr },
    { data: categories, error: cErr },
  ] = await Promise.all([
    db.from('warehouse_assemblies').select(
      'id, name, family_sku, image_url, item_kind, category_id, retail_product_id',
    ),
    db.from('warehouse_assembly_inventory').select('assembly_id, quantity, location_id'),
    db.from('warehouse_set_items').select('*'),
    db.from('categories').select('id, name'),
  ]);
  if (aErr) throw aErr;
  if (iErr) throw iErr;
  if (sErr) throw sErr;
  if (cErr) throw cErr;

  const categoriesById = new Map((categories || []).map((c) => [String(c.id), c.name]));
  const retailIndex = await loadRetailProductsForAssemblies(assemblies, options.retailProducts || []);
  const qtyByAssembly = kitweQtyByAssembly(inv || []);
  const products = [];
  const sets = [];

  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));

  (assemblies || []).forEach((a) => {
    if (isWarehouseSetAssembly(a)) {
      const stock = computeKitweSetBuildableQty(a.id, setItems, qtyByAssembly);
      if (stock <= 0) return;
      const kitweComponents = expandWarehouseSetItemsRows(setItems || [])
        .filter(
          (row) => String(row.set_assembly_id) === String(a.id)
            && String(row.location_id) === KITWE_LOCATION_ID,
        )
        .map((row) => {
          const comp = assemblyById.get(String(row.component_assembly_id));
          const retail = comp ? resolveRetailProductForAssembly(comp, retailIndex) : null;
          return {
            component_assembly_id: row.component_assembly_id,
            per_set: Math.max(1, Number(row.quantity) || 1),
            name: comp?.name || '',
            sku: comp?.family_sku || '',
            retail_product_id: retail?.id || comp?.retail_product_id || null,
          };
        });
      sets.push(applyKitweAssemblyPosPricing({
        assembly: a,
        stock,
        locationId: locId,
        productLocationPriceMap,
        retailIndex,
        categoriesById,
        isSet: true,
        kitweComponents,
      }));
      return;
    }
    const stock = qtyByAssembly.get(String(a.id)) || 0;
    if (stock <= 0 && !a.family_sku) return;
    products.push(applyKitweAssemblyPosPricing({
      assembly: a,
      stock,
      locationId: locId,
      productLocationPriceMap,
      retailIndex,
      categoriesById,
      isSet: false,
    }));
  });

  return { products, sets };
}

/** @deprecated use fetchKitweWarehousePosCatalog */
export async function fetchKitweWarehousePosProducts(locationId, options) {
  const { products } = await fetchKitweWarehousePosCatalog(locationId, options);
  return products;
}

/**
 * Kitwe POS: Products List (legacy migration) + warehouse catalog rows.
 * SKUs are intentionally different between the two during migration; Kitwe warehouse becomes the sole source of truth later.
 */
export function mergePosCatalogProducts(legacyProducts, kitweWarehouseProducts) {
  const legacy = (legacyProducts || []).map((p) => ({
    ...p,
    posCatalogSource: p.posCatalogSource || 'products_list',
  }));
  const kitwe = (kitweWarehouseProducts || []).map((p) => ({
    ...p,
    posCatalogSource: p.posCatalogSource || 'kitwe_warehouse',
  }));
  return [...legacy, ...kitwe];
}

export async function fetchKitweSetComponentLines(setAssemblyId) {
  const { data: setItems } = await db.from('warehouse_set_items').select('*');
  return expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.set_assembly_id) === String(setAssemblyId)
      && String(row.location_id) === KITWE_LOCATION_ID,
  );
}

export function isKitwePosCatalogRow(item) {
  return item?.posCatalogSource === 'kitwe_warehouse'
    || String(item?.id || '').startsWith('kitwe-wh-')
    || String(item?.id || '').startsWith('kitwe-set-');
}
