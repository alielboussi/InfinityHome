/**
 * Normalize warehouse product + packet display names to title case in Firestore.
 *
 * Dry run:  node scripts/fixWarehouseCatalogTitleCase.js
 * Apply:    node scripts/fixWarehouseCatalogTitleCase.js --apply
 */
import 'dotenv/config';
import { getDataClient } from '../server/lib/getDataClient.js';
import { titleCaseWords } from '../src/utils/titleCaseWords.js';

const APPLY = process.argv.includes('--apply');

async function fixTable(db, table, label) {
  const { data: rows, error } = await db.from(table).select('id, name');
  if (error) throw new Error(error.message || `Failed to load ${table}`);

  let changed = 0;
  const now = new Date().toISOString();

  for (const row of rows || []) {
    const before = String(row.name || '').trim();
    if (!before) continue;
    const after = titleCaseWords(before);
    if (after === before) continue;
    changed += 1;
    console.log(`${label} ${row.id}: "${before}" → "${after}"`);
    if (APPLY) {
      const { error: updErr } = await db.from(table).update({
        name: after,
        updated_at: now,
      }).eq('id', row.id);
      if (updErr) throw new Error(updErr.message || `Failed to update ${table} ${row.id}`);
    }
  }
  return changed;
}

async function main() {
  const db = getDataClient();
  console.log(APPLY ? 'Applying title case fixes…' : 'Dry run (pass --apply to write Firestore)…\n');

  const assemblyChanges = await fixTable(db, 'warehouse_assemblies', 'Product');
  const packetChanges = await fixTable(db, 'warehouse_packets', 'Packet');

  console.log('');
  console.log(`Products to update: ${assemblyChanges}`);
  console.log(`Packets to update: ${packetChanges}`);
  if (!APPLY && (assemblyChanges > 0 || packetChanges > 0)) {
    console.log('\nRe-run with --apply to persist changes.');
  } else if (APPLY) {
    console.log('Done.');
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
