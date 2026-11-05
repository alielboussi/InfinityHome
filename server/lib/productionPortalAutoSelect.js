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
 * - Carpentry app: adds it to /carpentry only.
 * - Upholstery app: adds it to /upholstery, adds it to Warehouse Floor 2 (and Carpentry raw catalog),
 *   and automatically links the Upholstery finished product to that Floor 2 raw product.
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
    await saveCarpentryProductSelection(sb, id, true);
    return { applied: 'carpentry' };
  }
  if (channel === 'upholstery') {
    const qty = Math.max(1, Math.floor(Number(floor2ProductQty ?? initialQuantity) || 1));
    await saveUpholsteryProductSelection(sb, id, true);
    await saveCarpentryProductSelection(sb, id, true);
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
      floor2_error = err?.message || String(err);
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
