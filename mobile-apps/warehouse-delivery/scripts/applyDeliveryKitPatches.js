/**
 * Re-apply warehouse-delivery-only changes after materializeDeliveryStandalone
 * (materialize copies production deliveryKit and wipes delivery-specific edits).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const kitRoot = path.join(appRoot, 'deliveryKit');
const overlaysRoot = path.join(appRoot, 'delivery-overlays');

const RETRYABLE_COPY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN']);

function sleep(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { /* postinstall / verify only */ }
}

/** Windows-safe copy (AV/indexer locks break copyFileSync). */
function copyFileRobust(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    try {
      const a = fs.statSync(src);
      const b = fs.statSync(dest);
      if (a.size === b.size) {
        const srcBuf = fs.readFileSync(src);
        const destBuf = fs.readFileSync(dest);
        if (srcBuf.equals(destBuf)) return;
      }
    } catch { /* overwrite */ }
  }
  const body = fs.readFileSync(src);
  const tmp = `${dest}.patch-${process.pid}-${Date.now()}.tmp`;
  let lastErr;
  for (let i = 0; i < 6; i += 1) {
    try {
      fs.writeFileSync(tmp, body);
      if (fs.existsSync(dest)) {
        try { fs.unlinkSync(dest); } catch { fs.rmSync(dest, { force: true }); }
      }
      fs.renameSync(tmp, dest);
      return;
    } catch (err) {
      lastErr = err;
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      const code = String(err?.code || '').toUpperCase();
      if (!RETRYABLE_COPY_CODES.has(code) || i >= 5) break;
      sleep(80 * (i + 1));
    }
  }
  throw lastErr;
}

function writeTextFileWithRetry(dest, body) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.patch-${process.pid}-${Date.now()}.tmp`;
  const attempt = () => {
    fs.writeFileSync(tmp, body, 'utf8');
    if (fs.existsSync(dest)) {
      try {
        fs.unlinkSync(dest);
      } catch {
        fs.rmSync(dest, { force: true });
      }
    }
    fs.renameSync(tmp, dest);
  };
  let lastErr;
  for (let i = 0; i < 6; i += 1) {
    try {
      attempt();
      return;
    } catch (err) {
      lastErr = err;
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch { /* ignore */ }
      const code = String(err?.code || '').toUpperCase();
      if (!RETRYABLE_COPY_CODES.has(code) || i >= 5) break;
      sleep(80 * (i + 1));
    }
  }
  throw lastErr;
}

function writePatchFile(filePath, body) {
  if (fs.existsSync(filePath)) {
    try {
      const cur = fs.readFileSync(filePath, 'utf8');
      if (cur === body) return;
    } catch { /* overwrite */ }
  }
  writeTextFileWithRetry(filePath, body);
}

function copyDirMerge(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyDirMerge(src, dest);
    } else {
      copyFileRobust(src, dest);
    }
  }
}

function patchSignatureScreen(filePath, screenKey) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('useDeliveryDrivers')) return;

  s = s.replace(
    "import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';",
    "import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';\nimport { useDeliveryDrivers } from '../../hooks/useDeliveryDrivers';",
  );

  s = s.replace(
    /  const \[drivers, setDrivers\] = useState\(\[\]\);\n  const \[driverId, setDriverId\] = useState\(''\);/,
    "  const [driverId, setDriverId] = useState('');",
  );

  s = s.replace(
    /  const \[driverPickerOpen, setDriverPickerOpen\] = useState\(false\);\n  const \[busy, setBusy\] = useState\(false\);/,
    "  const [driverPickerOpen, setDriverPickerOpen] = useState(false);\n  const { drivers, loading: driversLoading } = useDeliveryDrivers();\n  const [busy, setBusy] = useState(false);",
  );

  s = s.replace(
    /\n  useEffect\(\(\) => \{\n    warehouseMobileRequest\('delivery-drivers-list'\)\n      \.then\(\(res\) => setDrivers\(res\?\.drivers \|\| \[\]\)\)\n      \.catch\(\(\) => setDrivers\(\[\]\)\);\n  \}, \[\]\);\n/,
    '\n',
  );

  s = s.replace(
    /drivers=\{sortDeliveryDriversByName\(drivers\)\}\n(\s*)locale=\{locale\}/,
    'drivers={sortDeliveryDriversByName(drivers)}\n$1loading={driversLoading}\n$1locale={locale}',
  );

  if (!s.includes('useDeliveryDrivers')) {
    console.warn(`[applyDeliveryKitPatches] ${screenKey}: signature patch did not apply`);
  }
  writePatchFile(filePath, s);
}

function patchKitweSendHome(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('prefetchDeliveryDrivers')) return;

  s = s.replace(
    "import { fetchWarehouseCatalogCached } from '../shared/warehouseCatalogStore';",
    "import { fetchWarehouseCatalogCached, loadPersistedWarehouseCatalog } from '../shared/warehouseCatalogStore';",
  );
  s = s.replace(
    "import { buildPrintGroupsFromCart } from '../lib/deliveryPrintGroups';",
    "import { buildPrintGroupsFromCart } from '../lib/deliveryPrintGroups';\nimport { prefetchDeliveryDrivers } from '../../lib/deliveryDriversStore';",
  );

  const oldBlock = `  useEffect(() => {
    fetchWarehouseCatalogCached({ force: true, fullPackets: true }).then(setCatalog).catch(() => {});
  }, []);`;

  const newBlock = `  useEffect(() => {
    let cancelled = false;
    prefetchDeliveryDrivers();
    (async () => {
      const persisted = await loadPersistedWarehouseCatalog();
      if (persisted && !cancelled) setCatalog(persisted);
      try {
        const fresh = await fetchWarehouseCatalogCached({ fullPackets: true });
        if (!cancelled) setCatalog(fresh);
      } catch {
        // keep persisted catalog if any
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);`;

  if (s.includes(oldBlock)) {
    s = s.replace(oldBlock, newBlock);
  } else {
    console.warn('[applyDeliveryKitPatches] KitweSendHome: catalog useEffect patch did not apply');
  }
  writePatchFile(filePath, s);
}

function patchProductionNameClashUi(filePath) {
  if (!fs.existsSync(filePath)) return;
  const s = fs.readFileSync(filePath, 'utf8');
  if (!/\.\.\/\.\.\/\.\.\/\.\.\/src\/utils\/productionNameClashUi/.test(s)) return;
  const repoUtil = path.resolve(appRoot, '..', '..', 'src', 'utils', 'productionNameClashUi.js');
  if (!fs.existsSync(repoUtil)) {
    console.warn('[applyDeliveryKitPatches] productionNameClashUi: repo util missing — keeping shim');
    return;
  }
  const header = '/** Standalone for warehouse-delivery (no ../../../../src). */\n';
  writePatchFile(filePath, header + fs.readFileSync(repoUtil, 'utf8'));
}

function patchDeliveryWarehouseCatalog(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('filterAssembliesForDeliveryFloor1Only')) return;
  const tail = `
/** Floor 1 stock only — name used by Kitwe Send hub screen. */
export function filterAssembliesForDeliveryFloor1Only(catalog) {
  return filterAssembliesForDeliveryWarehouse(catalog);
}
`;
  writePatchFile(filePath, `${s.trimEnd()}\n${tail}`);
}

function uiStringsCloseIndex(s) {
  const marker = '\nconst PRESET_I18N = {';
  const presetIdx = s.indexOf(marker);
  if (presetIdx === -1) return -1;
  return s.lastIndexOf('\n};', presetIdx);
}

function ensureI18nKey(s, key, line) {
  const closeIdx = uiStringsCloseIndex(s);
  const inUiStrings = closeIdx !== -1 && s.slice(0, closeIdx).includes(`\n  ${key}:`);
  if (inUiStrings) return s;
  if (closeIdx === -1) {
    console.warn(`[applyDeliveryKitPatches] i18n: cannot insert ${key} — UI_STRINGS close not found`);
    return s;
  }
  const stray = new RegExp(`\\n\\s*${key}:\\s*\\{[^\\n]*\\},?`, 'g');
  s = s.replace(stray, '');
  const nextClose = uiStringsCloseIndex(s);
  if (nextClose === -1) return s;
  return `${s.slice(0, nextClose)}\n${line}${s.slice(nextClose)}`;
}

function patchDeliveryHubI18n(filePath) {
  if (!fs.existsSync(filePath)) return;
  const original = fs.readFileSync(filePath, 'utf8');
  let s = original;
  const extraFarmAndOrders = [
    ["deliveryFarmContinue", "  deliveryFarmContinue: { en: 'Continue', ar: 'متابعة' },"],
    ["deliveryFarmSend", "  deliveryFarmSend: { en: 'Send', ar: 'إرسال' },"],
    ["deliveryFarmDestFloor2", "  deliveryFarmDestFloor2: { en: 'Floor 2', ar: 'الطابق 2' },"],
    ["deliveryFarmDestKitwe", "  deliveryFarmDestKitwe: { en: 'Kitwe', ar: 'كيتوي' },"],
    ["filterCarpentry", "  filterCarpentry: { en: 'Carpentry', ar: 'النجارة' },"],
    ["filterUpholstery", "  filterUpholstery: { en: 'Upholstery', ar: 'التنجيد' },"],
    ["filterPainting", "  filterPainting: { en: 'Painting', ar: 'الدهان' },"],
    ["cardSource", "  cardSource: { en: 'Source', ar: 'المصدر' },"],
    ["cardCustomer", "  cardCustomer: { en: 'Customer', ar: 'الزبون' },"],
    ["cardDepartment", "  cardDepartment: { en: 'Department', ar: 'القسم' },"],
    ["cardQuoteNo", "  cardQuoteNo: { en: 'Quote #', ar: 'رقم العرض' },"],
  ];
  extraFarmAndOrders.forEach(([key, line]) => {
    s = ensureI18nKey(s, key, line);
  });
  if (!s.includes('sentDeliveriesSearchPlaceholder') && s.includes('sentDeliveriesTitle:')) {
    s = s.replace(
      "  sentDeliveriesTitle: { en: 'Sent deliveries', ar: 'التسليمات المرسلة' },",
      `  sentDeliveriesTitle: { en: 'Sent deliveries', ar: 'التسليمات المرسلة' },
  sentDeliveriesSearchPlaceholder: {
    en: 'Search #, customer name, or type (Floor 1 / Repair / Order / Sold)…',
    ar: 'ابحث بالرقم أو اسم الزبون أو النوع (الطابق 1 / إصلاح / طلب / مباع)…',
  },
  sentDeliveriesSearchNoMatch: { en: 'No deliveries match your search.', ar: 'لا توجد تسليمات مطابقة للبحث.' },
  sentDeliveryKindFloor1: { en: 'Floor 1', ar: 'الطابق 1' },
  sentDeliveryKindRepair: { en: 'Repair', ar: 'إصلاح' },
  sentDeliveryKindOrder: { en: 'Order', ar: 'طلب' },
  sentDeliveryKindSold: { en: 'Sold', ar: 'مباع' },`,
    );
    writePatchFile(filePath, s);
  }
  if (!s.includes('deliveryCustomerAddBtn') && s.includes('deliveryCustomerDriver:')) {
    s = s.replace(
      "  deliveryCustomerDriver: { en: 'Customer driver', ar: 'سائق العميل' },",
      "  deliveryCustomerDriver: { en: 'Customer driver', ar: 'سائق العميل' },\n  deliveryCustomerAddBtn: { en: 'Add customer driver', ar: 'إضافة سائق العميل' },",
    );
    writePatchFile(filePath, s);
  }
  const repairKindLine = "  deliveryRepairKindLabel: { en: 'Repair', ar: 'إصلاح' },";
  if (!s.includes('deliveryRepairKindLabel') && s.includes('deliveryRepairDeliverBtn:')) {
    s = s.replace('  deliveryRepairDeliverBtn:', `${repairKindLine}\n  deliveryRepairDeliverBtn:`);
    writePatchFile(filePath, s);
  }
  const block = `  deliveryHubTitle: { en: 'Delivery', ar: 'التسليم' },
  deliveryHubTab_floor1: { en: 'Floor 1', ar: 'الطابق 1' },
  deliveryHubTab_repairs: { en: 'Repairs', ar: 'إصلاحات' },
  deliveryHubTab_orders: { en: 'Orders', ar: 'طلبات' },
  deliveryRepairQueueEmpty: {
    en: 'No repairs waiting for a driver.',
    ar: 'لا توجد إصلاحات بانتظار السائق.',
  },
  deliveryOrderQueueEmpty: {
    en: 'No finished orders waiting for a driver.',
    ar: 'لا توجد طلبات منتهية بانتظار السائق.',
  },
  deliveryRepairKindLabel: { en: 'Repair', ar: 'إصلاح' },
  deliveryRepairDeliverBtn: { en: 'Deliver repair', ar: 'تسليم الإصلاح' },
  deliveryOrderDeliverBtn: { en: 'Deliver order', ar: 'تسليم الطلب' },
  deliveryRepairCustomer: { en: 'Customer pickup', ar: 'استلام العميل' },
  customerDriverSave: { en: 'Save', ar: 'حفظ' },
  dashFloor1Deliveries: { en: 'Floor 1 Deliveries', ar: 'تسليمات الطابق 1' },
  dashFarmDeliveries: { en: 'Farm Deliveries', ar: 'تسليمات المزرعة' },
  dashDeliveryRepairs: { en: 'Repairs', ar: 'إصلاحات' },
  dashDeliveryOrders: { en: 'Orders', ar: 'طلبات' },
`;
  if (s.includes('dashFarmDeliveries') && s.includes('dashFloor1Deliveries')) return;
  if (s.includes('deliveryHubTab_repairs') && s.includes('deliveryRepairQueueEmpty')) return;
  const ordersLine = "  deliveryHubTab_orders: { en: 'Orders', ar: 'طلبات' },";
  const queueExtra = `
  deliveryRepairQueueEmpty: {
    en: 'No repairs waiting for a driver.',
    ar: 'لا توجد إصلاحات بانتظار السائق.',
  },
  deliveryOrderQueueEmpty: {
    en: 'No finished orders waiting for a driver.',
    ar: 'لا توجد طلبات منتهية بانتظار السائق.',
  },
  deliveryRepairKindLabel: { en: 'Repair', ar: 'إصلاح' },
  deliveryRepairDeliverBtn: { en: 'Deliver repair', ar: 'تسليم الإصلاح' },
  deliveryOrderDeliverBtn: { en: 'Deliver order', ar: 'تسليم الطلب' },
  deliveryRepairCustomer: { en: 'Customer pickup', ar: 'استلام العميل' },
  customerDriverSave: { en: 'Save', ar: 'حفظ' },
  deliveryStatus_completedAwaiting: {
    en: 'Ready for delivery',
    ar: 'مكتمل (بانتظار التسليم)',
  },
  deliveryAccessDenied: {
    en: 'Delivery app access is off or could not be verified.',
    ar: 'صلاحية تطبيق التسليم غير مفعّلة أو تعذّر التحقق منها.',
  },`;
  if (s.includes('deliveryHubTab_repairs') && s.includes(ordersLine) && !s.includes('deliveryRepairQueueEmpty')) {
    s = s.replace(ordersLine, `${ordersLine}${queueExtra}`);
    writePatchFile(filePath, s);
    return;
  }
  if (s.includes('deliveryHubTab_repairs')) {
    if (s !== original) writePatchFile(filePath, s);
    return;
  }
  const dashLine = "  dashDelivery: { en: 'Send Delivery', ar: 'إرسال التسليم' },";
  if (s.includes(dashLine) && !s.includes('dashFloor1Deliveries')) {
    s = s.replace(
      dashLine,
      `${dashLine}
  dashFloor1Deliveries: { en: 'Floor 1 Deliveries', ar: 'تسليمات الطابق 1' },
  dashFarmDeliveries: { en: 'Farm Deliveries', ar: 'تسليمات المزرعة' },
  dashDeliveryRepairs: { en: 'Repairs', ar: 'إصلاحات' },
  dashDeliveryOrders: { en: 'Orders', ar: 'طلبات' },`,
    );
  }
  const anchor = '  deliveryCustomerDriver:';
  if (s.includes(anchor)) {
    s = s.replace(anchor, `${block}  deliveryCustomerDriver:`);
  } else if (s.includes('  deliveryDriver:')) {
    s = s.replace(/(  deliveryDriver: \{[^}]+\},)/, `$1\n${block}`);
  } else {
    console.warn('[applyDeliveryKitPatches] delivery hub i18n: no anchor found');
    return;
  }
  writePatchFile(filePath, s);
}

function patchDeliveryOrderQueue(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  s = s.replace(
    /import \{ printGroupsFromQuoteLines \} from '\.\.\/\.\.\/\.\.\/\.\.\/src\/utils\/warehouseDeliveryPrintGroups\.js';/,
    "import { printGroupsFromQuoteLines } from '../lib/warehouseOrderPrintGroups.js';",
  );
  if (!s.includes('../lib/warehouseOrderPrintGroups.js')) {
    s = s.replace(
      /import \{ printGroupsFromQuoteLines \} from '[^']+';/,
      "import { printGroupsFromQuoteLines } from '../lib/warehouseOrderPrintGroups.js';",
    );
  }
  if (!s.includes('production_job_id: row.production_job_id')) {
    s = s.replace(
      /quote_number: row\.quote_number \|\| null,\n/,
      `quote_number: row.quote_number || null,
    production_job_id: row.production_job_id || null,
`,
    );
  }
  writePatchFile(filePath, s);
}

function patchKioskNavLayout(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('kioskAndroidNavReserve') && s.includes('kioskModalBottomPad')) return;
  s = s.replace(
    /const ANDROID_NAV_MIN = \d+;/,
    `const ANDROID_NAV_MIN = 72;
export const KIOSK_SCROLL_EXTRA_BOTTOM = 28;

/** Space reserved for the Android 3-button / Samsung nav bar (often reported as 0). */
export function kioskAndroidNavReserve(insets) {
  const reported = Number(insets?.bottom) || 0;
  if (Platform.OS === 'android') return Math.max(reported, ANDROID_NAV_MIN);
  return Math.max(reported, 16);
}`,
  );
  s = s.replace(
    /\/\*\* Bottom inset for footers when SafeArea reports 0 on Android\. \*\/\r?\nexport function kioskFooterBottomPad\(insets\) \{\r?\n  const reported = insets\?\.bottom \?\? 0;\r?\n  if \(Platform\.OS === 'android'\) \{\r?\n    return Math\.max\(reported, ANDROID_NAV_MIN\);\r?\n  \}\r?\n  return Math\.max\(reported, 16\);\r?\n\}/,
    `/**
 * Extra gap above flow buttons. Android nav chrome is reserved by DeliverySafeFrame in App.js.
 */
export function kioskFooterBottomPad(_insets) {
  return 16;
}

/** Modals sit above the window (outside DeliverySafeFrame) — include the nav reserve. */
export function kioskModalBottomPad(insets) {
  return kioskAndroidNavReserve(insets) + 12;
}`,
  );
  writePatchFile(filePath, s);
}

function main() {
  require('./ensureDeliveryQuotePrintUtils').main?.();
  copyDirMerge(overlaysRoot, kitRoot);
  patchKioskNavLayout(path.join(kitRoot, 'lib', 'kioskLayout.js'));
  patchProductionNameClashUi(path.join(kitRoot, 'lib', 'productionNameClashUi.js'));
  patchDeliveryHubI18n(path.join(kitRoot, 'lib', 'productionKioskI18n.js'));
  patchDeliveryWarehouseCatalog(path.join(kitRoot, 'lib', 'deliveryWarehouseCatalog.js'));
  patchDeliveryOrderQueue(path.join(kitRoot, 'screens', 'DeliveryOrderQueueScreen.js'));

  patchSignatureScreen(
    path.join(kitRoot, 'screens', 'KitweSendSignatureScreen.js'),
    'KitweSendSignature',
  );
  patchSignatureScreen(
    path.join(kitRoot, 'screens', 'SoldDeliverSignatureScreen.js'),
    'SoldDeliverSignature',
  );
  patchKitweSendHome(path.join(kitRoot, 'screens', 'KitweSendHomeScreen.js'));

  console.log('[applyDeliveryKitPatches] ok');
}

if (require.main === module) {
  main();
}

module.exports = { main };
