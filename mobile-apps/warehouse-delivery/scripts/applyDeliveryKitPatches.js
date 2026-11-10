/**
 * Re-apply warehouse-delivery-only changes after materializeDeliveryStandalone
 * (materialize copies production deliveryKit and wipes delivery-specific edits).
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const kitRoot = path.join(appRoot, 'deliveryKit');
const overlaysRoot = path.join(appRoot, 'delivery-overlays');

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
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
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
  fs.writeFileSync(filePath, s);
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
  fs.writeFileSync(filePath, s);
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
  fs.writeFileSync(filePath, header + fs.readFileSync(repoUtil, 'utf8'));
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
  fs.writeFileSync(filePath, `${s.trimEnd()}\n${tail}`);
}

function patchDeliveryHubI18n(filePath) {
  if (!fs.existsSync(filePath)) return;
  let s = fs.readFileSync(filePath, 'utf8');
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
  deliveryRepairDeliverBtn: { en: 'Deliver repair', ar: 'تسليم الإصلاح' },
  deliveryOrderDeliverBtn: { en: 'Deliver order', ar: 'تسليم الطلب' },
  deliveryRepairCustomer: { en: 'Customer pickup', ar: 'استلام العميل' },
  customerDriverSave: { en: 'Save', ar: 'حفظ' },
  dashFloor1Deliveries: { en: 'Floor 1 Deliveries', ar: 'تسليمات الطابق 1' },
  dashDeliveryRepairs: { en: 'Repairs', ar: 'إصلاحات' },
  dashDeliveryOrders: { en: 'Orders', ar: 'طلبات' },
`;
  if (s.includes('dashFloor1Deliveries')) return;
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
  deliveryRepairDeliverBtn: { en: 'Deliver repair', ar: 'تسليم الإصلاح' },
  deliveryOrderDeliverBtn: { en: 'Deliver order', ar: 'تسليم الطلب' },
  deliveryRepairCustomer: { en: 'Customer pickup', ar: 'استلام العميل' },
  customerDriverSave: { en: 'Save', ar: 'حفظ' },
  deliveryStatus_completedAwaiting: {
    en: 'Completed (Awaiting Delivery)',
    ar: 'مكتمل (بانتظار التسليم)',
  },`;
  if (s.includes('deliveryHubTab_repairs') && s.includes(ordersLine) && !s.includes('deliveryRepairQueueEmpty')) {
    s = s.replace(ordersLine, `${ordersLine}${queueExtra}`);
    fs.writeFileSync(filePath, s);
    return;
  }
  if (s.includes('deliveryHubTab_repairs')) {
    fs.writeFileSync(filePath, s);
    return;
  }
  const dashLine = "  dashDelivery: { en: 'Send Delivery', ar: 'إرسال التسليم' },";
  if (s.includes(dashLine) && !s.includes('dashFloor1Deliveries')) {
    s = s.replace(
      dashLine,
      `${dashLine}
  dashFloor1Deliveries: { en: 'Floor 1 Deliveries', ar: 'تسليمات الطابق 1' },
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
  fs.writeFileSync(filePath, s);
}

function main() {
  copyDirMerge(overlaysRoot, kitRoot);
  patchProductionNameClashUi(path.join(kitRoot, 'lib', 'productionNameClashUi.js'));
  patchDeliveryHubI18n(path.join(kitRoot, 'lib', 'productionKioskI18n.js'));
  patchDeliveryWarehouseCatalog(path.join(kitRoot, 'lib', 'deliveryWarehouseCatalog.js'));

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
