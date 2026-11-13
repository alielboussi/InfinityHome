/**
 * Guards workshop policy: no instant Floor 1 credit from upholstery/carpentry manufacture ops.
 * Usage: node scripts/verifyProductionFloor1JobPolicy.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const upholsteryManufacture = read('server/lib/upholsteryManufacture.js');
const upholsteryJobs = read('server/lib/upholsteryProductionJobs.js');
const carpentryManufacture = read('server/lib/carpentryManufacture.js');
const carpentryJobs = read('server/lib/carpentryProductionJobs.js');
const paintingJobs = read('server/lib/paintingProductionJobs.js');

let failed = 0;

if (!/executeUpholsteryManufacture[\s\S]*pushFloor2ToProductionJob/.test(upholsteryManufacture)) {
  console.error('[verifyProductionFloor1JobPolicy] upholstery manufacture must open jobs, not credit Floor 1');
  failed += 1;
}

const floor2Push = read('server/lib/productionManufactureFloor2.js');
if (!/route === 'carpentry'[\s\S]*startCarpentryCatalogManufactureJob/.test(floor2Push)) {
  console.error('[verifyProductionFloor1JobPolicy] carpentry Floor 2 push must open catalog manufacture job (add stock on finish)');
  failed += 1;
}
if (!/adjustAssemblyInventory[\s\S]*floor2Id[\s\S]*-qty/.test(floor2Push)
    || !/floor2_raw_deducted: true/.test(floor2Push)) {
  console.error('[verifyProductionFloor1JobPolicy] upholstery manufacture must deduct Floor 2 immediately');
  failed += 1;
}

if (!/finishUpholsteryProductionJob[\s\S]*registerProductionJobAwaitingDriver/.test(upholsteryJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] upholstery job finish must register delivery admin queue (no instant Floor 1)');
  failed += 1;
}

if (/executeCarpentryFloorManufacture[\s\S]*startCarpentryCatalogManufactureJob/.test(carpentryManufacture)
    && /completeCarpentryCatalogManufacture/.test(carpentryManufacture)) {
  // ok
} else {
  console.error('[verifyProductionFloor1JobPolicy] carpentry manufacture must defer stock to job finish');
  failed += 1;
}

if (!read('server/lib/productionFloor1StockPolicy.js').includes('Do not credit or deduct Floor 1')) {
  console.error('[verifyProductionFloor1JobPolicy] missing productionFloor1StockPolicy.js');
  failed += 1;
}

if (!/sendAssemblyToPaintingDepartment[\s\S]*adjustAssemblyInventory[\s\S]*floor2LocationId[\s\S]*-qty/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] carpentry send-to-painting must deduct Floor 2 on send');
  failed += 1;
}

if (!/finishPaintingProductionJob[\s\S]*registerProductionJobAwaitingDriver/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] painting job finish must register delivery admin queue');
  failed += 1;
}
if (!/finishPaintingProductionJob[\s\S]*enqueueWarehouseProductionLabelJob/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] painting job finish must print warehouse labels');
  failed += 1;
}
if (!/LABEL_PHOTO_FLOOR2/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] painting labels must use Floor 2 photo QR');
  failed += 1;
}
if (!/destination = 'delivery'[\s\S]*floor1/.test(paintingJobs)
    && !/dest === 'floor1'/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] painting finish must support Floor 1 storage destination');
  failed += 1;
}

if (failed) {
  process.exit(1);
}
console.log('[verifyProductionFloor1JobPolicy] OK');
