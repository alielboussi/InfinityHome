/**
 * Mixed customer orders: split workshop cards + Floor 2 line deduct (not materials).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

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

assert(fs.existsSync(path.join(root, 'src/utils/quoteProductionLineSet.js')), 'quoteProductionLineSet.js');
const routing = read('server/lib/quoteProductionRouting.js');
assert(routing.includes('customerQuoteNeedsSplitCards'), 'list must split mixed customer quote cards');
assert(routing.includes('production_line_set'), 'routing must expose production_line_set on list rows');
assert(routing.includes('assertFloor2CardCanStartTimer'), 'accept must gate Floor 2 timer on stock');
assert(read('server/lib/quoteProductionFloor2LineDeduct.js').includes('deductFloor2ForQuoteLineReady'), 'line ready must deduct Floor 2');
assert(read('server/lib/quoteProductionPartialComplete.js').includes('deductFloor2ForQuoteLineReady'), 'partial ready must call Floor 2 deduct');
assert(read('server/lib/quoteProductionPartialComplete.js').includes('floor2_qty_capped'), 'partial ready must flag Floor 2 qty cap');
assert(read('mobile-apps/shared/quoteFloor2QtyCapAlert.js').includes('floor2_qty_capped'), 'apps must alert when Floor 2 caps qty');
assert(read('server/lib/productionJobMaterials.js').includes('Floor 2 WIP cannot be deducted as job materials'), 'quote materials must block Floor 2');
assert(read('mobile-apps/shared/quoteProductionPartialUi.js').includes("setQtyDraft('')"), 'qty modal must not preset qty chips');
assert(read('mobile-apps/carpentry-workshop/screens/QuotesScreen.js').includes('QuoteProductionLineSetBadge'), 'carpentry list shows card kind');
assert(read('mobile-apps/carpentry-workshop/components/ProductionJobMaterialsModal.js').includes('const isHassanQuoteMaterials = false'), 'carpentry materials catalog must not merge Floor 2');
assert(read('mobile-apps/carpentry-workshop/services/carpentryApi.js').includes('production_line_set'), 'carpentry API passes production_line_set');

if (!process.exitCode) console.log('verifyQuoteProductionSplitCards: ok');