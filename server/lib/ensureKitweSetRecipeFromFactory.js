import { WAREHOUSE_TO_LOCATION_ID } from '../../src/utils/warehouseDelivery.js';
import {
  factorySetRecipeComponentLines,
  setRecipeRowsForLocation,
  KITWE_SET_DELIVERY_LOCATION_ID,
  FACTORY_SET_RECIPE_LOCATION_ID,
} from '../../src/utils/warehouseSetDeliveryRecipe.js';
import { validateSetComponentAssembly } from '../../src/utils/warehouseCatalogHierarchy.js';
import { ensureAssemblyListedAtKitwe } from './kitweDeliveryCatalogSync.js';
import { newUuid } from './uuid.js';

const SET_ITEMS = 'warehouse_set_items';

/**
 * @deprecated Kitwe sets are created manually on /kitwe-products — factory deliveries
 * only restock component products at Kitwe using the Warehouse (factory) recipe.
 */
export async function ensureKitweSetRecipeFromFactory(sb, setAssemblyId, {
  setItems,
  assembliesById,
  now = new Date().toISOString(),
} = {}) {
  const setId = String(setAssemblyId || '').trim();
  if (!setId) return { mirrored: false, reason: 'missing_set_id', addedRows: [] };

  const catalog = setItems || [];
  const existingKitwe = setRecipeRowsForLocation(setId, catalog, KITWE_SET_DELIVERY_LOCATION_ID);
  if (existingKitwe.length) {
    await ensureAssemblyListedAtKitwe(sb, setId);
    return { mirrored: false, reason: 'kitwe_recipe_exists', addedRows: [] };
  }

  const factoryLines = factorySetRecipeComponentLines(setId, catalog);
  if (!factoryLines.length) {
    return { mirrored: false, reason: 'no_factory_recipe', addedRows: [] };
  }

  const rows = [];
  const seen = new Set();
  for (const line of factoryLines) {
    const componentId = String(line.component_assembly_id || '').trim();
    if (!componentId || componentId === setId || seen.has(componentId)) continue;
    const component = assembliesById?.get?.(componentId);
    validateSetComponentAssembly(component, { setAssemblyId: setId });
    seen.add(componentId);
    rows.push({
      location_id: KITWE_SET_DELIVERY_LOCATION_ID,
      set_assembly_id: setId,
      component_assembly_id: componentId,
      quantity: Math.max(1, Number(line.quantity) || 1),
      updated_at: now,
    });
  }
  if (!rows.length) {
    return { mirrored: false, reason: 'invalid_factory_recipe', addedRows: [] };
  }

  const { error } = await sb.from(SET_ITEMS).upsert(rows, {
    onConflict: 'location_id,set_assembly_id,component_assembly_id',
  });
  if (error) throw new Error(error.message || 'Failed to mirror set recipe at Kitwe');

  await ensureAssemblyListedAtKitwe(sb, setId);

  const addedRows = rows.map((row) => ({ ...row, id: row.id || newUuid() }));
  return {
    mirrored: true,
    reason: 'mirrored_from_factory',
    addedRows,
    recipe_location_id: FACTORY_SET_RECIPE_LOCATION_ID,
  };
}

export async function ensureKitweSetRecipesForDeliverySession(sb, sessionId, {
  setItems,
  assembliesById,
} = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) return [];

  const { data: entries, error } = await sb
    .from('warehouse_delivery_entries')
    .select('kind, metadata')
    .eq('session_id', sid);
  if (error) throw new Error(error.message || 'Failed to load delivery lines');

  const setIds = [...new Set(
    (entries || [])
      .filter((e) => String(e.kind) === 'set-parent')
      .map((e) => String(e.metadata?.set_assembly_id || '').trim())
      .filter(Boolean),
  )];

  let workingSetItems = setItems;
  if (!workingSetItems) {
    const { data: loaded, error: loadErr } = await sb.from(SET_ITEMS).select('*');
    if (loadErr) throw new Error(loadErr.message || 'Failed to load set items');
    workingSetItems = loaded || [];
  }

  let assemblyById = assembliesById;
  if (!assemblyById) {
    const { data: assemblies, error: aErr } = await sb
      .from('warehouse_assemblies')
      .select('id, name, family_sku, item_kind, inventory_mode');
    if (aErr) throw new Error(aErr.message || 'Failed to load warehouse products');
    assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  }

  const results = [];
  for (const setId of setIds) {
    const result = await ensureKitweSetRecipeFromFactory(sb, setId, {
      setItems: workingSetItems,
      assembliesById: assemblyById,
    });
    if (result.addedRows?.length) {
      workingSetItems = [...workingSetItems, ...result.addedRows];
    }
    results.push({ set_assembly_id: setId, ...result });
  }
  return results;
}
