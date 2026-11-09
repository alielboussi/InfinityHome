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

if (!/creditUpholsteryFinishedOutput/.test(upholsteryJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] upholstery Floor 1 credit must be in job finish');
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

if (!/finishPaintingProductionJob[\s\S]*adjustAssemblyInventory[\s\S]*floor1LocationId[\s\S]*qty/.test(paintingJobs)) {
  console.error('[verifyProductionFloor1JobPolicy] painting finish must credit Floor 1');
  failed += 1;
}

if (failed) {
  process.exit(1);
}
console.log('[verifyProductionFloor1JobPolicy] OK');
