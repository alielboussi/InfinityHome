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
  let changed = false;
  if (!s.includes('filterAssembliesForDeliveryFloor1Only')) {
    s = `${s.trimEnd()}

/** Floor 1 stock only — name used by Kitwe Send hub screen. */
export function filterAssembliesForDeliveryFloor1Only(catalog) {
  return filterAssembliesForDeliveryWarehouse(catalog);
}
`;
    changed = true;
  }
  if (!s.includes('filterAssembliesForDeliveryFloor2Farm')) {
    s = `${s.trimEnd()}

/** Floor 2 WIP with on-hand qty — Farm Deliveries send (Floor 2 → farm). */
export function filterAssembliesForDeliveryFloor2Farm(catalog) {
  const list = catalog?.assemblies;
  if (!Array.isArray(list) || !list.length) return [];
  const { assemblyWarehouseQty } = catalogStockMaps(catalog);
  return list.filter((assembly) => {
    if (!assembly?.id) return false;
    if (isStoreroomMaterial(assembly)) return false;
    const id = String(assembly.id);
    const qty = Math.max(
      0,
      Number(assemblyWarehouseQty?.[id] ?? catalog?.assemblyWarehouseQty?.[id] ?? 0) || 0,
    );
    return qty > 0;
  });
}
`;
    changed = true;
  }
  if (changed) writePatchFile(filePath, s);
}

function uiStringsCloseIndex(s) {
  const marker = '\nconst PRESET_I18N = {';
  const presetIdx = s.indexOf(marker);
  if (presetIdx === -1) return -1;
  return s.lastIndexOf('\n};', presetIdx);
}

function replaceI18nObject(s, key, block) {
  const trimmed = block.trimEnd();
  const oneLine = new RegExp(`  ${key}: \\{[^\\n]*\\},`);
  if (oneLine.test(s)) return s.replace(oneLine, trimmed);
  const multi = new RegExp(`  ${key}: \\{[\\s\\S]*?\\n  \\},`);
  if (multi.test(s)) return s.replace(multi, trimmed);
  return ensureI18nKey(s, key, `${trimmed}\n`);
}

function patchEpsonPrintI18n(s) {
  const rows = [
    [
      'deliveryPrintHint',
      `  deliveryPrintHint: {
    en: 'Sends the delivery note PDF to the Epson EcoTank L3250 (Email Print). No printer picker. The PDF already includes two copies.',
    ar: 'يُرسل PDF مذكرة التسليم إلى Epson EcoTank L3250 عبر البريد. بدون اختيار طابعة. الملف يحتوي نسختين.',
  },`,
    ],
    [
      'deliveryPrintAutoHint',
      `  deliveryPrintAutoHint: {
    en: 'Sending the note to the Epson EcoTank L3250. Keep the printer on and connected to Wi‑Fi with internet.',
    ar: 'جاري إرسال المذكرة إلى Epson EcoTank L3250. اترك الطابعة قيد التشغيل ومتصلة بواي فاي بالإنترنت.',
  },`,
    ],
    [
      'deliveryPrintBusy',
      "  deliveryPrintBusy: { en: 'Sending to Epson L3250…', ar: 'جاري الإرسال إلى Epson L3250…' },",
    ],
    [
      'deliveryPrintEpsonSend',
      "  deliveryPrintEpsonSend: { en: 'Print on Epson L3250', ar: 'طباعة على Epson L3250' },",
    ],
    [
      'deliveryPrintRetryHint',
      `  deliveryPrintRetryHint: {
    en: 'If nothing came out, check the Epson is on, Wi‑Fi has internet, Email Print is registered, then tap Retry.',
    ar: 'إذا لم تخرج نسخة، تحقق أن Epson قيد التشغيل والواي فاي متصل بالإنترنت وتسجيل Email Print، ثم اضغط إعادة المحاولة.',
  },`,
    ],
    [
      'deliveryPrintTimeoutError',
      `  deliveryPrintTimeoutError: {
    en: 'Print timed out. Check the Epson Wi‑Fi/internet and Retry.',
    ar: 'انتهت مهلة الطباعة. تحقق من واي فاي/إنترنت Epson ثم اضغط إعادة المحاولة.',
  },`,
    ],
  ];
  let next = s;
  rows.forEach(([key, block]) => {
    next = replaceI18nObject(next, key, block);
  });
  return next;
}

function patchWarehouseMobileApiFarmSetupError(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('export function mapFarmWarehouseSetupError')) return;
  if (!s.includes('export function isLikelyNetworkError')) return;
  s = s.replace(
    'export function isLikelyNetworkError(err) {',
    `export function mapFarmWarehouseSetupError(raw, locale, tUi) {
  const msg = String(raw || '').trim();
  const translate = (key, fallback) => {
    if (typeof tUi === 'function') {
      const text = String(tUi(key, locale) || '').trim();
      if (text && text !== key) return text;
    }
    return fallback || msg;
  };
  if (/floor 2 location is not configured/i.test(msg)) {
    return translate(
      'deliveryFarmSetupFloor2Missing',
      'Warehouse Floor 2 is not configured.',
    );
  }
  if (/farm warehouse/i.test(msg) && /not configured/i.test(msg)) {
    return translate(
      'deliveryFarmSetupFarmMissing',
      'Farm Warehouse is not configured.',
    );
  }
  return msg;
}

export function isLikelyNetworkError(err) {`,
  );
  writePatchFile(filePath, s);
}

function patchWarehouseMobileApiErrorCode(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('err.code = payload?.code')) return;
  if (!s.includes('err.details = payload?.details || null;')) return;
  s = s.replace(
    'err.details = payload?.details || null;',
    'err.details = payload?.details || null;\n    err.code = payload?.code || err.code;',
  );
  writePatchFile(filePath, s);
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
    ["deliveryFarmTitle", "  deliveryFarmTitle: { en: 'Farm Deliveries', ar: 'تسليمات المزرعة' },"],
    ["deliveryFarmFromFixed", "  deliveryFarmFromFixed: { en: 'From {name}', ar: 'من {name}' },"],
    ["deliveryFarmSourceTitle", "  deliveryFarmSourceTitle: { en: 'Farm', ar: 'المزرعة' },"],
    ["deliveryFarmDestTitle", "  deliveryFarmDestTitle: { en: 'Deliver to', ar: 'التسليم إلى' },"],
    ["deliveryFarmDestRequired", "  deliveryFarmDestRequired: { en: 'Choose Floor 2 or Kitwe.', ar: 'اختر الطابق 2 أو كيتوي.' },"],
    ["deliveryFarmSearchPlaceholder", "  deliveryFarmSearchPlaceholder: { en: 'Search name or SKU…', ar: 'ابحث بالاسم أو SKU…' },"],
    ["deliveryFarmScanA11y", "  deliveryFarmScanA11y: { en: 'Scan product', ar: 'مسح المنتج' },"],
    ["deliveryFarmNoProducts", "  deliveryFarmNoProducts: { en: 'No products at this farm.', ar: 'لا توجد منتجات في هذه المزرعة.' },"],
    ["deliveryFarmCartTitle", "  deliveryFarmCartTitle: { en: 'Cart ({n})', ar: 'السلة ({n})' },"],
    ["deliveryFarmOpeningSession", "  deliveryFarmOpeningSession: { en: 'Opening session…', ar: 'جاري فتح الجلسة…' },"],
    ["deliveryFarmCatalogFailed", "  deliveryFarmCatalogFailed: { en: 'Could not load farm catalog.', ar: 'تعذر تحميل كتالوج المزرعة.' },"],
    ["deliveryFarmAlertPickProduct", "  deliveryFarmAlertPickProduct: { en: 'Select a product', ar: 'اختر منتجاً' },"],
    ["deliveryFarmAlertPickProductBody", "  deliveryFarmAlertPickProductBody: { en: 'Search or scan a product first.', ar: 'ابحث أو امسح منتجاً أولاً.' },"],
    ["deliveryFarmAlertInsufficient", "  deliveryFarmAlertInsufficient: { en: 'Not enough stock', ar: 'المخزون غير كافٍ' },"],
    ["deliveryFarmAlertAvailable", "  deliveryFarmAlertAvailable: { en: 'Available: {n}', ar: 'المتوفر: {n}' },"],
    ["deliveryFarmAlertExceeds", "  deliveryFarmAlertExceeds: { en: 'Cart cannot exceed farm stock ({n}).', ar: 'لا يمكن تجاوز مخزون المزرعة ({n}).' },"],
    ["deliveryFarmAlertNoMatch", "  deliveryFarmAlertNoMatch: { en: 'No match', ar: 'لا توجد مطابقة' },"],
    ["deliveryFarmAlertNoMatchBody", "  deliveryFarmAlertNoMatchBody: { en: 'That scan did not match a farm product.', ar: 'المسح لا يطابق منتجاً في المزرعة.' },"],
    ["deliveryFarmAlertEmptyCart", "  deliveryFarmAlertEmptyCart: { en: 'Cart is empty', ar: 'السلة فارغة' },"],
    ["deliveryFarmAlertEmptyCartBody", "  deliveryFarmAlertEmptyCartBody: { en: 'Add products before continuing.', ar: 'أضف منتجات قبل المتابعة.' },"],
    ["deliveryFarmOnHand", "  deliveryFarmOnHand: { en: 'On hand: {n}', ar: 'المتوفر: {n}' },"],
    ["deliveryFarmQtyLabel", "  deliveryFarmQtyLabel: { en: 'Quantity', ar: 'الكمية' },"],
    ["deliveryFarmQtyMax", "  deliveryFarmQtyMax: { en: 'Max {n}', ar: 'الحد {n}' },"],
    ["deliveryFarmAddToCart", "  deliveryFarmAddToCart: { en: 'Add to cart', ar: 'إضافة إلى السلة' },"],
    ["deliveryFarmScanTitle", "  deliveryFarmScanTitle: { en: 'Quantity', ar: 'الكمية' },"],
    ["deliveryFarmRemove", "  deliveryFarmRemove: { en: 'Remove', ar: 'إزالة' },"],
    ["deliveryFarmDriverOnlyHint", "  deliveryFarmDriverOnlyHint: { en: 'Driver signature only — no customer driver.', ar: 'توقيع السائق فقط — بدون سائق العميل.' },"],
    ["deliveryFarmSignatureTitle", "  deliveryFarmSignatureTitle: { en: 'Farm delivery signature', ar: 'توقيع تسليم المزرعة' },"],
    ["deliveryFarmReturnSignatureTitle", "  deliveryFarmReturnSignatureTitle: { en: 'Farm return signature', ar: 'توقيع إرجاع المزرعة' },"],
    ["deliveryFarmToWarehouseTitle", "  deliveryFarmToWarehouseTitle: { en: 'Farm to warehouse', ar: 'من المزرعة إلى المستودع' },"],
    ["deliveryFarmReturnDoneTitle", "  deliveryFarmReturnDoneTitle: { en: 'Farm transfer sent', ar: 'تم إرسال تحويل المزرعة' },"],
    ["deliveryFarmReturnDoneHead", "  deliveryFarmReturnDoneHead: { en: 'Transfer sent', ar: 'تم الإرسال' },"],
    ["deliveryFarmWhatsAppRequiredTitle", "  deliveryFarmWhatsAppRequiredTitle: { en: 'WhatsApp', ar: 'واتساب' },"],
    ["deliveryFarmWhatsAppRequiredBody", "  deliveryFarmWhatsAppRequiredBody: { en: 'Send the PDF on WhatsApp to finish.', ar: 'أرسل ملف PDF عبر واتساب للإنهاء.' },"],
    ["deliveryFarmWhatsAppDone", "  deliveryFarmWhatsAppDone: { en: 'PDF shared.', ar: 'تم مشاركة PDF.' },"],
    ["deliveryFarmOpenPdf", "  deliveryFarmOpenPdf: { en: 'Open PDF', ar: 'فتح PDF' },"],
    ["deliveryFarmDone", "  deliveryFarmDone: { en: 'Done', ar: 'تم' },"],
    ["deliveryQtyShort", "  deliveryQtyShort: { en: 'Qty {n}', ar: 'الكمية {n}' },"],
    ["deliveryAccessDenied", "  deliveryAccessDenied: { en: 'You do not have access to Delivery.', ar: 'ليست لديك صلاحية تطبيق التسليم.' },"],
    ["deliveryBoxesOnTruck", "  deliveryBoxesOnTruck: { en: 'Boxes on truck', ar: 'الصناديق على الشاحنة' },"],
    ["deliveryPrintBrowserDialog", "  deliveryPrintBrowserDialog: { en: 'Print (browser dialog)', ar: 'طباعة (نافذة المتصفح)' },"],
    ["deliveryPrintWebHint", "  deliveryPrintWebHint: { en: 'Use the browser print dialog.', ar: 'استخدم نافذة طباعة المتصفح.' },"],
    ["deliverySessionRenewed", "  deliverySessionRenewed: { en: 'Session renewed — continue scanning.', ar: 'تم تجديد الجلسة — تابع المسح.' },"],
    ["deliverySetNeedOneComponent", "  deliverySetNeedOneComponent: { en: 'Select at least one set component for the truck.', ar: 'اختر مكون طقم واحداً على الأقل للشاحنة.' },"],
    ["deliverySetOnTruck", "  deliverySetOnTruck: { en: 'On truck', ar: 'على الشاحنة' },"],
    ["deliverySetPartialHint", "  deliverySetPartialHint: { en: 'Tick components that go on the truck. Unticked stay on Floor 1.', ar: 'حدد المكونات التي تذهب على الشاحنة. غير المحددة تبقى في الطابق 1.' },"],
    ["deliverySetStayFloor1", "  deliverySetStayFloor1: { en: 'Stay Floor 1', ar: 'يبقى في الطابق 1' },"],
    ["deliverySetStayFloor1Detail", "  deliverySetStayFloor1Detail: { en: 'This component stays on Floor 1.', ar: 'هذا المكون يبقى في الطابق 1.' },"],
    ["deliverySubmit", "  deliverySubmit: { en: 'Submit', ar: 'إرسال' },"],
    ["deliveryUnifiedQueueEmpty", "  deliveryUnifiedQueueEmpty: { en: 'No orders ready for delivery.', ar: 'لا توجد طلبات جاهزة للتسليم.' },"],
    ["edit", "  edit: { en: 'Edit', ar: 'تعديل' },"],
    ["filterAll", "  filterAll: { en: 'All', ar: 'الكل' },"],
    ["filterCarpentry", "  filterCarpentry: { en: 'Carpentry', ar: 'النجارة' },"],
    ["filterUpholstery", "  filterUpholstery: { en: 'Upholstery', ar: 'التنجيد' },"],
    ["filterPainting", "  filterPainting: { en: 'Painting', ar: 'الدهان' },"],
    ["filterRepair", "  filterRepair: { en: 'Repair', ar: 'إصلاح' },"],
    ["loadFailed", "  loadFailed: { en: 'Could not load.', ar: 'تعذر التحميل.' },"],
    ["changeStoreroom", "  changeStoreroom: { en: 'Change storeroom', ar: 'تغيير المخزن' },"],
    ["chooseStoreroom", "  chooseStoreroom: { en: 'Choose storeroom', ar: 'اختر المخزن' },"],
    ["quoteOrderCarpentryDispositionPrompt", "  quoteOrderCarpentryDispositionPrompt: { en: 'Credit Floor 1 stock, or send WIP from Floor 2 to the Painting department?', ar: 'إضافة مخزون الطابق 1، أم إرسال WIP من الطابق الثاني إلى قسم الدهانات؟' },"],
    ["quoteLineCompletedQty", "  quoteLineCompletedQty: { en: 'Completed', ar: 'مكتمل' },"],
    ["quoteLineRemainingQty", "  quoteLineRemainingQty: { en: 'Remaining', ar: 'المتبقي' },"],
    ["quoteOrderAluminumThickness", "  quoteOrderAluminumThickness: { en: 'Thickness', ar: 'السماكة' },"],
    ["sentDeliveryRefWhd", "  sentDeliveryRefWhd: { en: 'WHD', ar: 'WHD' },"],
    ["sentToCustomerTitle", "  sentToCustomerTitle: { en: 'Sent to customer', ar: 'أُرسل للزبون' },"],
    ["soldAlreadyDelivered", "  soldAlreadyDelivered: { en: 'Already delivered', ar: 'تم التسليم مسبقاً' },"],
    ["soldStatus", "  soldStatus: { en: 'Status', ar: 'الحالة' },"],
    ["sourceCustomer", "  sourceCustomer: { en: 'Customer', ar: 'الزبون' },"],
    ["sourceRepair", "  sourceRepair: { en: 'Repair', ar: 'إصلاح' },"],
    ["sourceShowroom", "  sourceShowroom: { en: 'Showroom', ar: 'صالة العرض' },"],
    ["sourceWarehouse", "  sourceWarehouse: { en: 'Warehouse', ar: 'المستودع' },"],
    ["cardSource", "  cardSource: { en: 'Source', ar: 'المصدر' },"],
    ["cardCustomer", "  cardCustomer: { en: 'Customer', ar: 'الزبون' },"],
    ["cardDepartment", "  cardDepartment: { en: 'Department', ar: 'القسم' },"],
    ["cardQuoteNo", "  cardQuoteNo: { en: 'Quote #', ar: 'رقم العرض' },"],
    ["deliveryFarmSetupFloor2Missing", "  deliveryFarmSetupFloor2Missing: { en: 'Warehouse Floor 2 is not configured.', ar: 'مستودع الطابق 2 غير مُعدّ.' },"],
    ["deliveryFarmSetupFarmMissing", "  deliveryFarmSetupFarmMissing: { en: 'Farm Warehouse is not configured.', ar: 'مستودع المزرعة غير مُعدّ.' },"],
  ];
  extraFarmAndOrders.forEach(([key, line]) => {
    s = ensureI18nKey(s, key, line);
  });
  s = patchEpsonPrintI18n(s);
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
  if (s.includes('dashFarmDeliveries') && s.includes('dashFloor1Deliveries')) {
    if (s !== original) writePatchFile(filePath, s);
    return;
  }
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

function patchKioskRowDirection(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
  if (s.includes('export function kioskRowDirection')) return;
  if (!s.includes('export function kioskTextAlign')) {
    s = `${s.trimEnd()}

export function kioskRowDirection(locale) {
  return locale === 'ar' ? 'row-reverse' : 'row';
}
`;
    writePatchFile(filePath, s);
    return;
  }
  s = s.replace(
    /export function kioskTextAlign\(locale\) \{\r?\n  return locale === 'ar' \? 'right' : 'left';\r?\n\}/,
    `export function kioskTextAlign(locale) {
  return locale === 'ar' ? 'right' : 'left';
}

export function kioskRowDirection(locale) {
  return locale === 'ar' ? 'row-reverse' : 'row';
}`,
  );
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
  patchWarehouseMobileApiErrorCode(path.join(kitRoot, 'shared', 'warehouseMobileApi.js'));
  patchWarehouseMobileApiErrorCode(path.join(appRoot, 'shared', 'warehouseMobileApi.js'));
  patchWarehouseMobileApiFarmSetupError(path.join(kitRoot, 'shared', 'warehouseMobileApi.js'));
  patchWarehouseMobileApiFarmSetupError(path.join(appRoot, 'shared', 'warehouseMobileApi.js'));
  patchKioskNavLayout(path.join(kitRoot, 'lib', 'kioskLayout.js'));
  patchKioskRowDirection(path.join(kitRoot, 'lib', 'kioskLayout.js'));
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
