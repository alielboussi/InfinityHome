/**
 * Delete Hassan quotes by quote_number (e.g. 337, 338, 339).
 * Uses Firestore server client (same DB as web portal / production APIs).
 *
 * Usage: node scripts/deleteQuotesByNumber.js 337 338 339
 *        node scripts/deleteQuotesByNumber.js --force 337   (delete even if sent to production)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', 'vercel.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const nums = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');

function quoteNumberVariants(raw) {
  const n = String(raw || '').trim().replace(/^qt#?\s*/i, '');
  if (!n) return [];
  const variants = new Set([`QT#${n}`, n]);
  if (/^\d+$/.test(n)) variants.add(`QT#${String(n).padStart(3, '0')}`);
  return [...variants];
}

async function resolveQuoteRow(sb, raw) {
  for (const qn of quoteNumberVariants(raw)) {
    const { data: row } = await sb.from('quotations').select('id, quote_number').eq('quote_number', qn).maybeSingle();
    if (row?.id) return row;
  }
  return null;
}

async function deleteQuote(sb, raw, { force: forceDelete } = {}) {
  const row = await resolveQuoteRow(sb, raw);
  if (!row?.id) {
    console.warn(`Quote ${raw}: not found, skip`);
    return;
  }
  const { getQuoteProductionRouting } = await import('../server/lib/quoteProductionRouting.js');
  const routing = await getQuoteProductionRouting(sb, row.id);
  if (!forceDelete && routing?.sent_to_production_at && !routing?.completed_at) {
    throw new Error('Sent to production — use --force or complete in workshop first');
  }
  await sb.from('quotation_items').delete().eq('quotation_id', row.id);
  await sb.from('quote_production_routing').delete().eq('quote_id', row.id);
  const { error } = await sb.from('quotations').delete().eq('id', row.id);
  if (error) throw new Error(error.message || 'delete failed');
  console.log(`Quote ${row.quote_number || raw} (${row.id}) deleted${forceDelete ? ' (force)' : ''}.`);
}

async function main() {
  if (!nums.length) {
    console.error('Usage: node scripts/deleteQuotesByNumber.js [--force] <quote_number>...');
    process.exit(1);
  }
  const { createFirestoreServerClient } = await import('../server/lib/firestoreServerClient.js');
  const sb = createFirestoreServerClient();
  if (!sb) throw new Error('Database not configured (.env.local / vercel.env)');

  for (const num of nums) {
    try {
      await deleteQuote(sb, num, { force });
    } catch (e) {
      console.error(`Quote ${num}: ${e?.message || e}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});