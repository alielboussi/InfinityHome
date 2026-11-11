import { saveCarpentryProductSelection } from './carpentryCatalog.js';
import { addFloor1ProductToFloor2 } from './carpentryManufacture.js';
import {
  saveUpholsteryProductSelection,
  saveUpholsteryRawAssemblyLink,
} from './upholsteryCatalog.js';

function resolvePortalChannel(clientSource, explicit) {
  const fromBody = String(explicit || '').trim().toLowerCase();
  if (fromBody === 'carpentry' || fromBody === 'upholstery') return fromBody;
  const src = String(clientSource || '').trim();
  if (src === 'carpentry_workshop_app') return 'carpentry';
  if (src === 'warehouse_production_app' || src === 'upholstery_production_app') return 'upholstery';
  return '';
}

export function resolveProductionPortalChannel(clientSource, explicit) {
  return resolvePortalChannel(clientSource, explicit);
}

/** Qty to credit on Warehouse Floor 2 when a production app creates/adds a raw WIP line. */
export function resolveFloor2SeedQuantity(body, initialQty = 0) {
  const raw = body?.floor2_quantity
    ?? body?.floor2_product_qty
    ?? body?.raw_wip_qty
    ?? body?.initial_quantity
    ?? body?.initialQuantity
    ?? initialQty;
  return Math.max(1, Math.floor(Number(raw) || 0));
}

/**
 * When a workshop app creates a new product on Floor 1:
 * - Carpentry app: adds it to /carpentry only (and seeds Floor 2 qty when applicable).
 * - Upholstery app: adds it to /upholstery only, seeds Warehouse Floor 2 WIP, and links finished SKU to raw.
 *   Does not add the product to /carpentry — that catalog is explicit on the web Carpentry page only.
 */
export async function autoSelectProductionPortalCatalog(sb, assemblyId, {
  clientSource = '',
  portal_catalog: portalCatalog,
  auto_portal_catalog: autoPortalCatalog,
  initialQuantity = 1,
  floor2_product_qty: floor2ProductQty,
  userId = null,
} = {}) {
  const id = String(assemblyId || '').trim();
  if (!id) return { applied: null };
  const channel = resolvePortalChannel(
    clientSource,
    portalCatalog || autoPortalCatalog,
  );
  if (channel === 'carpentry') {
    const qty = resolveFloor2SeedQuantity({ initial_quantity: initialQuantity, floor2_product_qty: floor2ProductQty }, initialQuantity);
    await saveCarpentryProductSelection(sb, id, true);
    let floor2_added = false;
    let floor2_error = null;
    try {
      await addFloor1ProductToFloor2(sb, {
        assemblyId: id,
        productQty: qty,
        userId,
      });
      floor2_added = true;
    } catch (err) {
      throw new Error(err?.message || 'Failed to save Floor 2 quantity on the web portal.');
    }
    return {
      applied: 'carpentry',
      floor2_added,
      floor2_product_qty: qty,
      floor2_error,
    };
  }
  if (channel === 'upholstery') {
    const qty = Math.max(1, Math.floor(Number(floor2ProductQty ?? initialQuantity) || 1));
    await saveUpholsteryProductSelection(sb, id, true);
    await saveUpholsteryRawAssemblyLink(sb, id, id);
    let floor2_added = false;
    let floor2_error = null;
    try {
      await addFloor1ProductToFloor2(sb, {
        assemblyId: id,
        productQty: qty,
        userId,
      });
      floor2_added = true;
    } catch (err) {
      throw new Error(err?.message || 'Failed to save Floor 2 quantity on the web portal.');
    }
    return {
      applied: 'upholstery',
      floor2_added,
      floor2_product_qty: qty,
      raw_assembly_id: id,
      floor2_error,
    };
  }
  return { applied: null };
}
