/**
 * One-off: Test Frame — zero Floor 2 + Factory stock after bad instant manufacture,
 * backfill active upholstery job (qty 5, raw already deducted).
 *
 *   node scripts/fixTestFrameUpholsteryAfterBadManufacture.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

const RAW_ID = '343f2e8b-2c3b-412a-965b-f8ca323ecc39';
const JOB_QTY = 5;

async function main() {
  const apply = process.argv.includes('--apply');
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const { resolveWarehouseFloor2Location } = await import('../src/constants/warehouseFloorLocations.js');
  const { WAREHOUSE_FACTORY_LOCATION_ID } = await import('../src/constants/warehouseShowroomLocations.js');
  const { recomputeWarehouseLocationStockServer } = await import('../server/lib/warehouseLocationStockRecompute.js');
  const { newUuid } = await import('../server/lib/uuid.js');

  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured');

  const { data: locRows } = await sb.from('locations').select('id, name');
  const floor2Id = resolveWarehouseFloor2Location(locRows || [])?.id;
  if (!floor2Id) throw new Error('Floor 2 location missing');

  const { data: assembly } = await sb
    .from('warehouse_assemblies')
    .select('id, name, family_sku')
    .eq('id', RAW_ID)
    .maybeSingle();
  if (!assembly?.id) throw new Error('Test Frame assembly not found');

  const { data: activeJobs } = await sb
    .from('upholstery_production_jobs')
    .select('id, status, product_qty')
    .eq('raw_assembly_id', RAW_ID)
    .in('status', ['ready', 'running', 'paused']);

  const plan = {
    apply,
    assembly: { id: assembly.id, name: assembly.name },
    set_floor2_qty: 0,
    set_factory_qty: 0,
    backfill_job: activeJobs?.length
      ? null
      : { product_qty: JOB_QTY, note: 'raw already deducted by bad upholstery-manufacture run' },
    existing_active_jobs: activeJobs || [],
  };
  console.log(JSON.stringify(plan, null, 2));

  if (!apply) {
    console.log('\nDry run only — pass --apply to write.');
    return;
  }

  const now = new Date().toISOString();
  for (const [locId, qty] of [
    [String(floor2Id), 0],
    [String(WAREHOUSE_FACTORY_LOCATION_ID), 0],
  ]) {
    const { error } = await sb.from('warehouse_assembly_inventory').upsert({
      assembly_id: RAW_ID,
      location_id: locId,
      quantity: qty,
      updated_at: now,
    }, { onConflict: 'assembly_id,location_id' });
    if (error) throw new Error(error.message || `Failed to set qty at ${locId}`);
    await recomputeWarehouseLocationStockServer(sb, locId);
  }

  if (!activeJobs?.length) {
    const jobId = newUuid();
    const { error: insErr } = await sb.from('upholstery_production_jobs').insert({
      id: jobId,
      raw_assembly_id: RAW_ID,
      finished_assembly_id: RAW_ID,
      raw_name: assembly.name,
      finished_name: assembly.name,
      finished_sku: assembly.family_sku || '',
      product_qty: JOB_QTY,
      status: 'ready',
      accumulated_ms: 0,
      timer_started_at: null,
      started_at: now,
      completed_at: null,
      accepted_by: null,
      metadata: {
        channel: 'warehouse_production_app',
        floor2_push: true,
        material_usage_rows: [],
        manual_material_lines: [],
        storeroom_location_ids: [],
        backfill_bad_manufacture: true,
      },
      created_at: now,
      updated_at: now,
    });
    if (insErr) throw new Error(insErr.message || 'Failed to create backfill job');
    console.log(`Created upholstery job ${jobId} qty ${JOB_QTY}`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
