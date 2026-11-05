import { saveCarpentryProductSelection } from './carpentryCatalog.js';
import { saveUpholsteryProductSelection } from './upholsteryCatalog.js';

function resolvePortalChannel(clientSource, explicit) {
  const fromBody = String(explicit || '').trim().toLowerCase();
  if (fromBody === 'carpentry' || fromBody === 'upholstery') return fromBody;
  const src = String(clientSource || '').trim();
  if (src === 'carpentry_workshop_app') return 'carpentry';
  if (src === 'warehouse_production_app' || src === 'upholstery_production_app') return 'upholstery';
  return '';
}

/**
 * When a workshop app creates a product on Floor 1, auto-add it to /carpentry or /upholstery.
 */
export async function autoSelectProductionPortalCatalog(sb, assemblyId, {
  clientSource = '',
  portal_catalog: portalCatalog,
  auto_portal_catalog: autoPortalCatalog,
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
    await saveUpholsteryProductSelection(sb, id, true);
    return { applied: 'upholstery' };
  }
  return { applied: null };
}
