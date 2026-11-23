/**
 * Reopen must use latest quote_order run (including completed), not active-only lookup.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const routingPath = path.join(root, 'server', 'lib', 'quoteProductionRouting.js');
const mobilePath = path.join(root, 'server', 'handlers', 'warehouse-mobile.js');

const routingSrc = fs.readFileSync(routingPath, 'utf8');
const mobileSrc = fs.readFileSync(mobilePath, 'utf8');

const errors = [];

if (!routingSrc.includes('export async function findLatestQuoteOrderRun')) {
  errors.push('findLatestQuoteOrderRun missing');
}
const reopenBlock = routingSrc.split('export async function reopenQuoteProductionOrder')[1]?.split('export async function')[0] || '';
if (!reopenBlock.includes('findLatestQuoteOrderRun')) {
  errors.push('reopenQuoteProductionOrder must call findLatestQuoteOrderRun');
}
if (reopenBlock.includes('findActiveQuoteRun(sb, qid)')) {
  errors.push('reopenQuoteProductionOrder must not use findActiveQuoteRun for completed runs');
}
if (!reopenBlock.includes('routingOpen') || !reopenBlock.includes('!run.completed_at')) {
  errors.push('reopenQuoteProductionOrder must reopen when run still completed but routing open');
}
if (!mobileSrc.includes('Painting handoff failed')) {
  errors.push('opProductionQuoteComplete should rollback via reopen when painting send fails');
}

if (errors.length) {
  console.error('verifyQuoteProductionReopen failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('verifyQuoteProductionReopen OK');