import { buildCarpentryCatalogPayload, listCarpentryCatalogProducts } from './carpentryCatalogView';
import { buildUpholsteryCatalogPayload, listUpholsteryCatalogProducts } from './upholsteryCatalogView';
import { getCachedProductionPortalSnapshot } from './loadProductionPortalCatalogInputs';

/** Instant paint for /upholstery from shared portal snapshot (no API / auth imports). */
export function getCachedUpholsteryCatalog() {
  const snap = getCachedProductionPortalSnapshot();
  if (!snap || !Array.isArray(snap.assemblies)) return null;
  return {
    ...buildUpholsteryCatalogPayload(snap.assemblies, snap.setItems, snap.portalInputs),
    carpentryProducts: listCarpentryCatalogProducts(snap.assemblies),
    locations: snap.portalInputs?.locations || [],
  };
}

/** Instant paint for /carpentry from shared portal snapshot. */
export function getCachedCarpentryCatalog() {
  const snap = getCachedProductionPortalSnapshot();
  if (!snap || !Array.isArray(snap.assemblies)) return null;
  return {
    ...buildCarpentryCatalogPayload(snap.assemblies, snap.setItems, snap.portalInputs),
    upholsteryProducts: listUpholsteryCatalogProducts(snap.assemblies),
    locations: snap.portalInputs?.locations || [],
  };
}
