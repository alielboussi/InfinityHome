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

function main() {
  copyDirMerge(overlaysRoot, kitRoot);
  patchProductionNameClashUi(path.join(kitRoot, 'lib', 'productionNameClashUi.js'));

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
