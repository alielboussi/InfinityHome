/**
 * Cancel active painting job(s) by product name or SKU; restore Floor 2 / Floor 1 if deducted.
 *
 *   node scripts/cancelPaintingJobByProduct.js --name "Aria 2 Seater"
 *   node scripts/cancelPaintingJobByProduct.js --sku 15VX5N7CE6B80GH5 --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return '';
  return String(process.argv[i + 1] || '').trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const name = argValue('--name');
  const sku = argValue('--sku');
  if (!name && !sku) {
    console.error('Usage: node scripts/cancelPaintingJobByProduct.js --name "Product" [--apply]');
    console.error('   or: node scripts/cancelPaintingJobByProduct.js --sku FAMILY_SKU [--apply]');
    process.exit(1);
  }

  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const {
    findActivePaintingJobsByProduct,
    cancelPaintingProductionJob,
  } = await import('../server/lib/paintingProductionJobs.js');

  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured (.env.local / vercel.env)');

  const matches = await findActivePaintingJobsByProduct(sb, { name, sku });
  if (!matches.length) {
    console.log('No active painting jobs found for', { name: name || null, sku: sku || null });
    return;
  }

  const plan = matches.map((row) => ({
    job_id: row.id,
    product_name: row.product_name,
    product_sku: row.product_sku,
    qty: row.product_qty,
    status: row.status,
    inventory_source: row.metadata?.inventory_source || null,
    carpentry_quote_id: row.metadata?.carpentry_quote_id || null,
  }));
  console.log(JSON.stringify({ apply, matches: plan }, null, 2));

  if (!apply) {
    console.log('\nDry run — pass --apply to cancel and restore stock.');
    return;
  }

  for (const row of matches) {
    const result = await cancelPaintingProductionJob(sb, {
      jobId: row.id,
      reason: 'cancelPaintingJobByProduct.js',
    });
    console.log('Cancelled:', result.job?.product_name, result.stock_restored || result.virtual_hold);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});