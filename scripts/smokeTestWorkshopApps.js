/**
 * Screen + API wiring smoke for Delivery, Carpentry, Painting (and Upholstery handoff).
 * Usage: node scripts/smokeTestWorkshopApps.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
  failed += 1;
  console.error('FAIL:', msg);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function screenNamesFromApp(appJs) {
  const names = new Set();
  const re = /<Stack\.Screen\s+name="([^"]+)"/g;
  let m;
  while ((m = re.exec(appJs))) names.add(m[1]);
  return names;
}

function importPathsFromApp(appJs, appDir) {
  const out = [];
  const re = /from ['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(appJs))) {
    const spec = m[1];
    if (!/Screen|Gate|Auth/.test(spec) && !spec.includes('screens/')) continue;
    const abs = path.join(root, appDir, spec);
    const candidates = ['', '.js', '.jsx'].map((ext) => abs.endsWith('.js') || abs.endsWith('.jsx') ? abs : abs + ext);
    out.push({ spec, ok: candidates.some((p) => fs.existsSync(p)) });
  }
  return out;
}

function navigateTargets(source) {
  const names = new Set();
  const re = /navigate\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1]);
  return names;
}

function collectJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectJsFiles(full, acc);
    else if (/\.(js|jsx)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

function opsFromSource(source) {
  const ops = new Set();
  const re = /warehouseMobileRequest\(\s*['"]([a-z0-9-]+)['"]/g;
  let m;
  while ((m = re.exec(source))) ops.add(m[1]);
  return ops;
}

function handlerCases(handlerSrc) {
  const cases = new Set();
  const re = /case\s+'([a-z0-9-]+)':/g;
  let m;
  while ((m = re.exec(handlerSrc))) cases.add(m[1]);
  return cases;
}

const handler = read('server/handlers/warehouse-mobile.js');
const cases = handlerCases(handler);

const apps = [
  {
    id: 'delivery',
    dir: 'mobile-apps/warehouse-delivery',
    appJs: 'mobile-apps/warehouse-delivery/App.js',
    expectedScreens: [
      'Dashboard', 'KitweSendHome', 'KitweSendSignature', 'DeliveryRepairQueue',
      'DeliveryOrderQueue', 'KitweSendProduct', 'KitweSendDone', 'KitweSentDeliveries',
      'KitweSentDeliveryDetail', 'SoldOrders', 'SoldOrderDetail', 'SoldDeliverSignature',
      'SoldDeliverDone',
    ],
    scanDirs: ['screens', 'deliveryKit/screens', 'hooks'],
    extraWiring: () => {
      const dash = read('mobile-apps/warehouse-delivery/screens/DashboardScreen.js');
      for (const nav of ['KitweSendHome', 'DeliveryRepairQueue', 'DeliveryOrderQueue', 'KitweSentDeliveries', 'SoldOrders']) {
        if (!dash.includes(`navigate('${nav}')`)) fail(`delivery dashboard missing navigate ${nav}`);
      }
    },
  },
  {
    id: 'carpentry',
    dir: 'mobile-apps/carpentry-workshop',
    appJs: 'mobile-apps/carpentry-workshop/App.js',
    expectedScreens: [
      'Dashboard', 'Create', 'Manufacture', 'Jobs', 'Painting', 'Quotes', 'QuoteDetail', 'Repairs', 'PushSettings',
    ],
    scanDirs: ['screens', 'services'],
    extraWiring: () => {
      const api = read('mobile-apps/carpentry-workshop/services/carpentryApi.js');
      if (!api.includes("'painting-send-from-floor2'")) fail('carpentry must call painting-send-from-floor2');
      const paint = read('mobile-apps/carpentry-workshop/screens/PaintingScreen.js');
      if (!paint.includes('sendCarpentryProductToPainting')) fail('carpentry Painting screen must send to painting');
    },
  },
  {
    id: 'painting',
    dir: 'mobile-apps/painting-workshop',
    appJs: 'mobile-apps/painting-workshop/App.js',
    expectedScreens: ['Dashboard', 'Jobs', 'PushSettings'],
    scanDirs: ['screens', 'services'],
    extraWiring: () => {
      const jobs = read('mobile-apps/painting-workshop/screens/JobsScreen.js');
      if (!jobs.includes('fetchPaintingProductionJobs')) fail('painting Jobs must load painting jobs');
      if (!jobs.includes('fetchPaintingReturnOrders')) fail('painting Jobs must load painting repairs');
      if (!jobs.includes("'painting-job-finish'") && !read('mobile-apps/painting-workshop/services/paintingApi.js').includes("'painting-job-finish'")) {
        fail('painting must finish jobs via painting-job-finish');
      }
    },
  },
  {
    id: 'upholstery',
    dir: 'mobile-apps/warehouse-upholstery',
    appJs: 'mobile-apps/warehouse-upholstery/App.js',
    expectedScreens: [
      'Dashboard', 'Create', 'Manufacture', 'Jobs', 'UpholsteryQuotes', 'UpholsteryQuoteDetail', 'Repairs', 'PushSettings',
    ],
    scanDirs: ['screens', 'services'],
    extraWiring: () => {},
  },
];

for (const app of apps) {
  if (!exists(app.appJs)) {
    fail(`${app.id}: App.js missing`);
    continue;
  }
  const src = read(app.appJs);
  const names = screenNamesFromApp(src);
  for (const name of app.expectedScreens) {
    if (!names.has(name)) fail(`${app.id}: missing Stack.Screen ${name}`);
  }
  for (const imp of importPathsFromApp(src, app.dir)) {
    if (!imp.ok) fail(`${app.id}: App import missing ${imp.spec}`);
  }

  let allSource = src;
  const files = [];
  for (const d of app.scanDirs) {
    collectJsFiles(path.join(root, app.dir, d), files);
  }
  for (const file of files) allSource += `\n${fs.readFileSync(file, 'utf8')}`;

  const targets = navigateTargets(allSource);
  const allowedNav = new Set([
    ...names,
    'goBack',
  ]);
  for (const t of targets) {
    if (t === 'goBack') continue;
    if (!names.has(t)) fail(`${app.id}: navigate('${t}') has no Stack.Screen`);
  }

  const ops = opsFromSource(allSource);
  for (const op of ops) {
    if (!cases.has(op)) fail(`${app.id}: warehouse-mobile has no case '${op}'`);
  }
  app.extraWiring();
  console.log(`${app.id}: screens=${[...names].join(',')} ops=${ops.size}`);
}

const queueLib = read('server/lib/warehouseDeliveryAdminQueue.js');
for (const needle of [
  "UPHOLSTERY_JOBS = 'upholstery_production_jobs'",
  "CARPENTRY_JOBS = 'carpentry_production_jobs'",
  "PAINTING_JOBS = 'painting_production_jobs'",
  'listCompletedJobsAwaitingDriver(sb, CARPENTRY_JOBS, \'carpentry\')',
  'listCompletedJobsAwaitingDriver(sb, UPHOLSTERY_JOBS, \'upholstery\')',
  'listCompletedJobsAwaitingDriver(sb, PAINTING_JOBS, \'painting\')',
  'registerProductionJobAwaitingDriver',
  'markRepairWorkCompleteAwaitingDriver',
]) {
  if (!queueLib.includes(needle.replace(/\\'/g, "'")) && !queueLib.includes(needle)) {
    fail(`delivery queue lib missing ${needle}`);
  }
}

for (const op of [
  'delivery-production-queue-list',
  'painting-send-from-floor2',
  'painting-job-list',
  'painting-job-finish',
  'carpentry-job-finish',
  'upholstery-job-finish',
  'return-order-complete',
]) {
  if (!cases.has(op)) fail(`handler missing ${op}`);
}

const deliveryApp = read('mobile-apps/warehouse-delivery/App.js');
if (deliveryApp.includes('ReturnOrders') || deliveryApp.includes('RepairReturnSignature')) {
  fail('delivery app must not own workshop repair shipping screens');
}

if (failed) {
  console.error(`smokeTestWorkshopApps: ${failed} failure(s)`);
  process.exit(1);
}
console.log('smokeTestWorkshopApps: ok');
