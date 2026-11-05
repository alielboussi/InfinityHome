/** Shared Supabase reads for /carpentry and /upholstery catalog list (Floor 1+2 products, storeroom materials). */
export async function loadProductionPortalCatalogInputs(db) {
  const [
    { data: inventory, error: invErr },
    { data: locations, error: locErr },
    { data: assemblyPackets, error: apErr },
    { data: packets, error: pktErr },
  ] = await Promise.all([
    db.from('warehouse_assembly_inventory').select('assembly_id, location_id, quantity'),
    db.from('locations').select('id, name'),
    db.from('warehouse_assembly_packets').select('assembly_id, packet_id, quantity_per_unit'),
    db.from('warehouse_packets').select('id'),
  ]);
  if (invErr) throw new Error(invErr.message || 'Failed to load warehouse assembly inventory');
  if (locErr) throw new Error(locErr.message || 'Failed to load locations');
  if (apErr) throw new Error(apErr.message || 'Failed to load assembly packet links');
  if (pktErr) throw new Error(pktErr.message || 'Failed to load warehouse packets');
  return {
    inventory: inventory || [],
    locations: locations || [],
    assemblyPackets: assemblyPackets || [],
    packets: packets || [],
  };
}
