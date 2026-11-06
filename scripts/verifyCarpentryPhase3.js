/**
 * Phase 3 — Hassan quote routing + mobile quote production ops.
 * Usage: node scripts/verifyCarpentryPhase3.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function includesAll(haystack, needles, label) {
  for (const n of needles) {
    assert(haystack.includes(n), `${label} missing: ${n}`);
  }
}

try {
  assert(fs.existsSync(path.join(root, 'server/lib/quoteProductionRouting.js')), 'quoteProductionRouting.js');
  assert(fs.existsSync(path.join(root, 'server/handlers/quote-production.js')), 'quote-production handler');

  includesAll(read('api/admin.js'), ["'quote-production'"], 'admin dispatcher');

  includesAll(read('server/handlers/warehouse-mobile.js'), [
    "case 'production-quotes-list'",
    "case 'production-quote-accept'",
    "case 'production-quote-complete'",
    "case 'production-quote-material-scan'",
  ], 'warehouse-mobile phase3');

  includesAll(read('src/Quotationer.js'), [
    'productionRoute',
    'Send Order',
    'Carpentry',
    'Upholstery',
  ], 'Quotationer');

  includesAll(read('src/QuotesBoard.js'), [
    'Send Order',
    'executeSendQuoteOrder',
  ], 'QuotesBoard');

  includesAll(read('mobile-apps/carpentry-workshop/services/carpentryApi.js'), [
    'production-quotes-list',
    'production-quote-material-scan',
  ], 'carpentry api');

  const productionApiPath = fs.existsSync(path.join(root, 'mobile-apps/warehouse-upholstery/services/productionApi.js'))
    ? 'mobile-apps/warehouse-upholstery/services/productionApi.js'
    : 'mobile-apps/warehouse-production/services/productionApi.js';
  includesAll(read(productionApiPath), [
    'fetchUpholsteryProductionQuotes',
    'upholstery',
  ], 'production api');

  includesAll(read('mobile-apps/carpentry-workshop/productionKiosk/lib/productionPushNotifications.js'), [
    "app_target: 'carpentry'",
    "screen === 'Quotes'",
  ], 'carpentry push registration');

  console.log('verifyCarpentryPhase3: ok');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(e.message || e);
}
