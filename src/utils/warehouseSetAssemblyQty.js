/**
 * Warehouse sets on Floor 1: increasing set qty consumes component products per factory recipe.
 */
import { WAREHOUSE_FACTORY_LOCATION_ID } from '../constants/warehouseShowroomLocations.js';
import { assemblyDerivesWarehouseStockFromPackets } from './warehouseAssemblyMath.js';
import { buildPacketsByAssembly } from './warehouseAssemblyPacketPool.js';
import {
  assertWarehouseProductQtyIncrementOnly,
  currentAssemblyWarehouseUnits,
  packetUpdatesForAssemblyTargetUnits,
} from './warehouseAssemblyProductQuantity.js';
import {
  buildWarehouseAssemblyLeftoverQtyMap,
  isWarehouseSetAssembly,
} from './warehouseSetMath.js';
import { expandWarehouseSetItemsRows } from './warehouseSetItems.js';

const ASSEMBLIES = 'warehouse_assemblies';
const PACKETS = 'warehouse_packets';
const INVENTORY = 'warehouse_packet_inventory';
const ASSEMBLY_INVENTORY = 'warehouse_assembly_inventory';
const ASSEMBLY_PACKETS = 'warehouse_assembly_packets';
const SET_ITEMS = 'warehouse_set_items';

const ASSEMBLY_QTY_COLUMNS = 'id, name, family_sku, packet_count, inventory_mode, units_per_carton, item_kind';
const PACKET_COLUMNS = 'id, sku, name, packet_number, qty_per_unit, assembly_id';

function factorySetRecipeLines(setAssemblyId, setItems) {
  return expandWarehouseSetItemsRows(setItems || []).filter(
    (row) => String(row.set_assembly_id) === String(setAssemblyId)
      && String(row.location_id) === String(WAREHOUSE_FACTORY_LOCATION_ID),
  );
}

/** Assembly + component ids referenced on Floor 1 set recipes (for scoped catalog reads). */
function factorySetCatalogScopeIds(setItems, setAssemblyId) {
  const ids = new Set([String(setAssemblyId)]);
  expandWarehouseSetItemsRows(setItems || []).forEach((row) => {
    if (String(row.location_id) !== String(WAREHOUSE_FACTORY_LOCATION_ID)) return;
    if (row.set_assembly_id) ids.add(String(row.set_assembly_id));
    if (row.component_assembly_id) ids.add(String(row.component_assembly_id));
  });
  return [...ids];
}

async function loadLocationAssemblyQtyMap(sb, locationId, {
  assemblies,
  assemblyInvRows,
  assemblyPacketRows,
  allPackets,
  packetInvRows,
}) {
  const locId = String(locationId);
  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows || [], allPackets || []);
  const invByPacket = new Map();
  (packetInvRows || []).forEach((row) => {
    if (String(row.location_id) !== locId) return;
    invByPacket.set(String(row.packet_id), Number(row.quantity) || 0);
  });
  const assemblyInvByAsm = new Map();
  (assemblyInvRows || []).forEach((row) => {
    if (String(row.location_id) !== locId) return;
    assemblyInvByAsm.set(String(row.assembly_id), Number(row.quantity) || 0);
  });

  const out = {};
  for (const assembly of assemblies || []) {
    if (!assembly?.id) continue;
    const id = String(assembly.id);
    if (isWarehouseSetAssembly(assembly)) {
      out[id] = Math.max(0, Math.floor(Number(assemblyInvByAsm.get(id)) || 0));
      continue;
    }
    const pktList = packetsByAssembly.get(id) || [];
    if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
      const inventoryByPacketId = new Map(invByPacket);
      pktList.forEach((p) => {
        if (!inventoryByPacketId.has(String(p.id))) inventoryByPacketId.set(String(p.id), 0);
      });
      const assemblyInventoryByLoc = new Map();
      const locMap = new Map();
      locMap.set(locId, assemblyInvByAsm.get(id) ?? 0);
      assemblyInventoryByLoc.set(id, locMap);
      out[id] = currentAssemblyWarehouseUnits(assembly, pktList, locId, {
        inventoryByPacketId,
        assemblyInventoryByLoc,
        poolOpts: {
          assemblyId: assembly.id,
          assemblyPacketRows: assemblyPacketRows || [],
          catalogPackets: allPackets || [],
        },
      });
    } else {
      out[id] = Math.max(0, Math.floor(Number(assemblyInvByAsm.get(id)) || 0));
    }
  }
  return out;
}

async function writeComponentUnitsAtLocation(sb, assembly, pktList, locationId, targetUnits) {
  const locId = String(locationId);
  const target = Math.max(0, Math.floor(Number(targetUnits) || 0));
  const packetUpdates = packetUpdatesForAssemblyTargetUnits(assembly, pktList, target);
  const now = new Date().toISOString();
  if (packetUpdates?.length) {
    await Promise.all(packetUpdates.map(async (row) => {
      const { error } = await sb.from(INVENTORY).upsert({
        packet_id: row.packetId,
        location_id: locId,
        quantity: row.quantity,
        updated_at: now,
      }, { onConflict: 'packet_id,location_id' });
      if (error) throw new Error(error.message || 'Failed to update packet quantity');
    }));
    const { error: asmInvErr } = await sb.from(ASSEMBLY_INVENTORY).upsert({
      assembly_id: assembly.id,
      location_id: locId,
      quantity: target,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (asmInvErr) throw new Error(asmInvErr.message || 'Failed to update finished quantity');
    return;
  }
  if (assemblyDerivesWarehouseStockFromPackets(assembly, pktList)) {
    throw new Error('Complete the packet BOM before adjusting component stock.');
  }
  const { error } = await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: assembly.id,
    location_id: locId,
    quantity: target,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (error) throw new Error(error.message || 'Failed to update component quantity');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<{ assembly_id: string, quantity: number, previous: number }>}
 */
export async function applyWarehouseSetQuantityFromRecipe(
  sb,
  {
    setAssemblyId,
    locationId,
    targetUnits,
    incrementOnly = true,
  } = {},
) {
  const setId = String(setAssemblyId || '').trim();
  const locId = String(locationId || '').trim();
  const target = Math.max(0, Math.floor(Number(targetUnits) || 0));
  if (!setId || !locId) throw new Error('Set and location are required');

  const [
    { data: setAssembly, error: setErr },
    { data: setItems, error: siErr },
    { data: setInvRow, error: setInvErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select('*').eq('id', setId).maybeSingle(),
    sb.from(SET_ITEMS).select('*'),
    sb.from(ASSEMBLY_INVENTORY).select('quantity')
      .eq('assembly_id', setId)
      .eq('location_id', locId)
      .maybeSingle(),
  ]);
  if (setErr) throw new Error(setErr.message || 'Failed to load set');
  if (siErr) throw new Error(siErr.message || 'Failed to load set recipe');
  if (setInvErr) throw new Error(setInvErr.message || 'Failed to load set stock');
  if (!setAssembly || !isWarehouseSetAssembly(setAssembly)) {
    throw new Error('Set not found');
  }

  const scopeIds = factorySetCatalogScopeIds(setItems, setId);
  const [
    { data: assemblies, error: asmErr },
    { data: assemblyInvRows, error: aiErr },
    { data: assemblyPacketRows, error: apErr },
    { data: allPackets, error: pErr },
  ] = await Promise.all([
    sb.from(ASSEMBLIES).select(ASSEMBLY_QTY_COLUMNS).in('id', scopeIds),
    sb.from(ASSEMBLY_INVENTORY).select('assembly_id, location_id, quantity')
      .eq('location_id', locId)
      .in('assembly_id', scopeIds),
    sb.from(ASSEMBLY_PACKETS).select('*').in('assembly_id', scopeIds),
    sb.from(PACKETS).select(PACKET_COLUMNS).in('assembly_id', scopeIds),
  ]);
  if (asmErr) throw new Error(asmErr.message || 'Failed to load products');
  if (aiErr) throw new Error(aiErr.message || 'Failed to load stock');
  if (apErr) throw new Error(apErr.message || 'Failed to load packet links');
  if (pErr) throw new Error(pErr.message || 'Failed to load packets');

  const packetIds = new Set();
  (assemblyPacketRows || []).forEach((row) => {
    const pid = String(row.packet_id || '').trim();
    if (pid) packetIds.add(pid);
  });
  (allPackets || []).forEach((pkt) => {
    const pid = String(pkt.id || '').trim();
    if (pid) packetIds.add(pid);
  });

  let packetInvRows = [];
  if (packetIds.size) {
    const { data, error: piErr } = await sb.from(INVENTORY)
      .select('packet_id, location_id, quantity')
      .eq('location_id', locId)
      .in('packet_id', [...packetIds]);
    if (piErr) throw new Error(piErr.message || 'Failed to load packet stock');
    packetInvRows = data || [];
  }

  const recipe = factorySetRecipeLines(setId, setItems);
  if (!recipe.length) {
    throw new Error('This set has no Floor 1 recipe — add products to the set first.');
  }

  const current = Math.max(0, Math.floor(Number(setInvRow?.quantity) || 0));
  if (incrementOnly) assertWarehouseProductQtyIncrementOnly(current, target);

  const delta = target - current;
  if (delta === 0) {
    return { assembly_id: setId, quantity: current, previous: current };
  }
  if (delta < 0) {
    throw new Error('Decreasing set quantity is not supported here — adjust component stock instead.');
  }

  const qtyRecord = await loadLocationAssemblyQtyMap(null, locId, {
    assemblies: assemblies || [],
    assemblyInvRows: assemblyInvRows || [],
    assemblyPacketRows: assemblyPacketRows || [],
    allPackets: allPackets || [],
    packetInvRows: packetInvRows || [],
  });
  const leftover = buildWarehouseAssemblyLeftoverQtyMap(
    qtyRecord,
    setItems || [],
    assemblies || [],
  );

  const packetsByAssembly = buildPacketsByAssembly(assemblyPacketRows || [], allPackets || []);
  const assemblyById = new Map((assemblies || []).map((a) => [String(a.id), a]));
  const invByPacket = new Map();
  (packetInvRows || []).forEach((row) => {
    invByPacket.set(String(row.packet_id), Number(row.quantity) || 0);
  });

  for (const line of recipe) {
    const componentId = String(line.component_assembly_id || '').trim();
    const perSet = Math.max(1, Number(line.quantity) || 1);
    const need = delta * perSet;
    const free = Math.max(0, Number(leftover[componentId] ?? 0));
    if (need > free) {
      const comp = assemblyById.get(componentId);
      const label = comp?.name || componentId;
      throw new Error(
        `Not enough "${label}" to build ${delta} more set(s) (need ${need}, available ${free} after other sets).`,
      );
    }
  }

  await Promise.all(recipe.map(async (line) => {
    const componentId = String(line.component_assembly_id || '').trim();
    const perSet = Math.max(1, Number(line.quantity) || 1);
    const toDeduct = delta * perSet;
    const assembly = assemblyById.get(componentId);
    if (!assembly) throw new Error('Set recipe references a missing product.');
    const pktList = packetsByAssembly.get(componentId) || [];
    const assemblyInventoryByLoc = new Map();
    const locMap = new Map();
    const invRow = (assemblyInvRows || []).find(
      (r) => String(r.assembly_id) === componentId && String(r.location_id) === locId,
    );
    locMap.set(locId, Number(invRow?.quantity) || 0);
    assemblyInventoryByLoc.set(componentId, locMap);
    const inventoryByPacketId = new Map(invByPacket);
    pktList.forEach((p) => {
      if (!inventoryByPacketId.has(String(p.id))) inventoryByPacketId.set(String(p.id), 0);
    });
    const componentUnits = currentAssemblyWarehouseUnits(assembly, pktList, locId, {
      inventoryByPacketId,
      assemblyInventoryByLoc,
      poolOpts: {
        assemblyId: assembly.id,
        assemblyPacketRows: assemblyPacketRows || [],
        catalogPackets: allPackets || [],
      },
    });
    const nextUnits = componentUnits - toDeduct;
    if (nextUnits < 0) {
      throw new Error(`Not enough stock for ${assembly.name}.`);
    }
    await writeComponentUnitsAtLocation(sb, assembly, pktList, locId, nextUnits);
  }));

  const now = new Date().toISOString();
  const { error: setUpdErr } = await sb.from(ASSEMBLY_INVENTORY).upsert({
    assembly_id: setId,
    location_id: locId,
    quantity: target,
    updated_at: now,
  }, { onConflict: 'assembly_id,location_id' });
  if (setUpdErr) throw new Error(setUpdErr.message || 'Failed to update set quantity');

  return { assembly_id: setId, quantity: target, previous: current, component_sets_built: delta };
}
