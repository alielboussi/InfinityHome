/**
 * Static checks for Factory → Kitwe mobile delivery + Hassan receiver flow.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const deliveries = fs.readFileSync(path.join(root, 'src/WarehouseDeliveries.js'), 'utf8');

function firstExistingPath(relativePaths) {
  for (const rel of relativePaths) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function readKitweSendHomeScreenSource() {
  const filePath = firstExistingPath([
    'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js',
    'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendHomeScreen.js',
  ]);
  assert(filePath, 'KitweSendHomeScreen.js missing under warehouse-delivery');
  return fs.readFileSync(filePath, 'utf8');
}

assert(mobile.includes('assertMobileDeliverySubmitAccess'), 'delivery submit must check mobile access');
assert(
  mobile.includes('await sendWarehouseDeliveryWhatsApp'),
  'delivery submit must await WhatsApp group notify',
);
assert(
  mobile.includes('buildWarehouseDeliveryWhatsAppMessage'),
  'delivery submit must build warehouse delivery WhatsApp message',
);
assert(mobile.includes('delivery-number-reset'), 'warehouse-mobile must support delivery-number-reset');
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryNumber.js'), 'utf8').includes('resetWarehouseDeliveryNumberSequence'),
  'delivery number reset helper must exist',
);
assert(mobile.includes('canWarehouseDeliveryReceiverActions'), 'receiver API must allow Hassan');
assert(mobile.includes('reused: true'), 'delivery-session-open must reuse draft sessions');
assert(
  fs.readFileSync(path.join(root, 'server/lib/sendWarehouseDeliveryWhatsApp.js'), 'utf8')
    .includes('deliverWarehouseDeliveryGroupMessage'),
  'warehouse delivery WhatsApp must call notify inline (not VERCEL_URL self-fetch only)',
);
assert(
  fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8')
    .includes('buildWarehouseDeliveryNotePdfBase64'),
  'delivery submit WhatsApp must attach delivery note PDF',
);
assert(
  fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8')
    .includes('buildWarehouseDeliveryWhatsAppProductGroups'),
  'delivery submit WhatsApp must build product groups from entries with colors',
);
assert(
  mobile.includes('whatsAppProductGroupsFromPrintGroups'),
  'order/repair WhatsApp must use quote/repair print groups, not catalog entries',
);
assert(
  mobile.includes('resolveAdminQueuePrintGroups'),
  'order/repair WhatsApp PDF must hydrate print groups from quote/return, not catalog fallback',
);
assert(
  mobile.includes('if (adminQueueKind) pdfBase64 = \'\''),
  'order/repair WhatsApp must rebuild PDF on the server from quote/repair lines',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/warehouseDeliveryDisplayName.js'), 'utf8')
    .includes('formatWarehouseDeliveryDisplayName'),
  'delivery display name helper must exist',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/sendWarehouseDeliveryWhatsApp.js'), 'utf8')
    .includes('pdfBase64'),
  'sendWarehouseDeliveryWhatsApp must forward pdfBase64 to notify',
);
assert(
  fs.readFileSync(path.join(root, 'api/notify.js'), 'utf8').includes('deliverWarehouseDeliveryGroupMessage'),
  'notify must export deliverWarehouseDeliveryGroupMessage for delivery submit',
);
assert(mobile.includes('whatsapp_sent_at'), 'delivery submit must record whatsapp_sent_at on success');
assert(mobile.includes('warehouseDeliveryWhatsAppRoute'), 'delivery submit must label Floor 1 / repair / order WhatsApp');
assert(mobile.includes("'repair_delivery'"), 'repair submit must tag WhatsApp as repair delivery');
assert(mobile.includes("'order_delivery'"), 'order submit must tag WhatsApp as order delivery');
assert(
  fs.readFileSync(path.join(root, 'api/notify.js'), 'utf8').includes("120363410583418058@g.us"),
  'warehouse delivery WhatsApp must target Automated Delivery Reciepts group',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendSignatureScreen.js'), 'utf8')
    .includes('document_kind: documentKind'),
  'signature submit must send document_kind so repair/order WhatsApp is labeled',
);
assert(!deliveries.includes('receiverTestMirror'), 'WarehouseDeliveries must not include Hassan test mirror');
assert(
  deliveries.includes('warehouseDeliveryReceiverLineKind'),
  'Hassan page must render finished-unit delivery lines (not packet_id only)',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/warehouseDelivery.js'), 'utf8').includes('warehouseDeliveryReceiverTickRows'),
  'receiver progress must use visible tick rows (set deliveries)',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/warehouseDelivery.js'), 'utf8').includes('set-parent') && fs
    .readFileSync(path.join(root, 'src/utils/warehouseDelivery.js'), 'utf8')
    .includes("deliveryEntryReceivable(line) ? 'receiver-line'"),
  'set-component finished units must be Kitwe tick rows',
);
assert(deliveries.includes('WAREHOUSE_RECEIVER_LIST_STATUSES'), 'Hassan page must load completed deliveries for history');
assert(
  !deliveries.includes('Send to customer'),
  'Hassan accept page must not offer send-to-customer (Kitwe receive only)',
);
assert(
  deliveries.includes('setDeliveryEntryReceiverCheck'),
  'Hassan accept page must tick lines into Kitwe via receiver check',
);
assert(mobile.includes('delivery-receiver-send-to-customer'), 'receiver send-to-customer op must stay routed for legacy clients');
assert(
  mobile.includes('Send to customer is disabled'),
  'receiver send-to-customer API must reject (Kitwe stock only)',
);
assert(
  fs.readFileSync(
    path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSentDeliveryDetailScreen.js'),
    'utf8',
  ).includes('customer_sent_lines'),
  'Delivery sent detail must show Hassan send-to-customer lines',
);
assert(!deliveries.includes('prev.filter((s) => String(s.id)'), 'Hassan page must not remove cards when accept completes');
assert(mobile.includes('admin_registry'), 'return/storage list must support admin registry');
assert(mobile.includes('driver_signature_url'), 'delivery submit must store driver signature url');
assert(mobile.includes('delivery-cancel'), 'warehouse-mobile must support delivery-cancel');
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAcceptStock.js'), 'utf8').includes('deductSourceStockOnDeliverySubmit'),
  'delivery submit must deduct send-location stock (in transit)',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAcceptStock.js'), 'utf8').includes('delivery_admin_hold'),
  'delivery admin queue (repairs/orders) must release virtual hold without floor stock',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAdminQueue.js'), 'utf8').includes('assertAdminQueueDeliveryHold'),
  'delivery submit must validate repair/order admin hold instead of floor qty',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAcceptStock.js'), 'utf8').includes('source_stock_deducted_at'),
  'delivery accept must credit Kitwe when stock already left send location',
);
assert(mobile.includes('delivery-draft-discard'), 'warehouse-mobile must discard failed delivery drafts');
assert(mobile.includes('deleteWarehouseDeliverySessionHard'), 'failed delivery submit must hard-delete draft');

const { execSync } = require('child_process');
execSync('node --check server/handlers/warehouse-mobile.js', { cwd: root, stdio: 'pipe' });
assert(mobile.includes('delivery-signature-upload'), 'warehouse-mobile must support delivery-signature-upload');
assert(
  /signature_png_base64|uploadWarehouseDeliverySignaturePng/.test(mobile),
  'delivery-submit must accept inline signature PNG upload',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/cancelWarehouseDelivery.js'), 'utf8').includes('stock_unchanged'),
  'cancel delivery must not move stock',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseDeliveryAccept.js'), 'utf8')
    .includes('finalizeWarehouseDeliverySession'),
  'delivery accept must finalize Kitwe catalog when lines already received',
);
assert(
  fs.readFileSync(path.join(root, 'src/WarehouseDeliveries.js'), 'utf8')
    .includes('deliverySessionNeedsCatalogFinalize'),
  'Hassan deliveries must finalize Kitwe catalog when lines already received',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/kitweSetStock.js'), 'utf8')
    .includes('kitwe_factory_delivery_units'),
  'Kitwe products list must include factory delivery unit metadata fallback',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/warehouseSetMath.js'), 'utf8')
    .includes("from './warehouseCatalogHierarchy.js'"),
  'warehouseSetMath must use .js import for Node delivery accept recompute',
);


const chrome = fs.readFileSync(path.join(root, 'src/AppChrome.js'), 'utf8');
assert(chrome.includes('/warehouse-deliveries-admin'), 'inventory nav must include Deliveries');
assert(
  deliveries.includes('adminMode') && deliveries.includes('sendWarehouseDeliveryWhatsApp'),
  'Deliveries admin must support resend WhatsApp with delivery note PDF',
);
assert(chrome.includes('/warehouse-repairs-admin'), 'inventory nav must include Repairs');
assert(
  chrome.includes('/warehouse-products/sales-storage')
  || read('src/components/WarehouseCatalogViewToggle.js').includes('Sales storage'),
  'Sales Storage must live under warehouse-products',
);
assert(!chrome.includes("route: '/warehouse-sales-storage-admin'"), 'Sales Storage sidebar link must be removed');
assert(!chrome.includes('warehouse-deliveries-hassan-test'), 'Hassan mirror test route must be removed');

const noteHtml = fs.readFileSync(path.join(root, 'src/utils/buildDeliveryNotePrintHtml.js'), 'utf8');
assert(noteHtml.includes('company-logo'), 'delivery note HTML must include company logo');
assert(noteHtml.includes('company-name'), 'delivery note must show company name under Delivery Note');
assert(noteHtml.includes('Bestrest Furniture'), 'delivery note must show Bestrest Furniture');
assert(
  noteHtml.includes('Delivery Dispatched By :'),
  'delivery note A4 must show Delivery Dispatched By alias before products',
);
assert(noteHtml.includes('repair_delivery'), 'repair delivery A4 must show customer block');
assert(
  fs.existsSync(path.join(root, 'src/utils/deliveryNoteCompanyLogoEmbedded.js')),
  'embedded delivery note logo must exist (run node scripts/embedDeliveryNoteLogo.js)',
);
const deliveryPdf = fs.readFileSync(path.join(root, 'src/utils/warehouseDeliveryPdf.js'), 'utf8');
assert(deliveryPdf.includes('deliverySenderName'), 'warehouse delivery PDF must show app name not email');
assert(noteHtml.includes('Page ${pageIndex} of ${pageTotal}'), 'delivery note must show page numbers');
assert(mobile.includes('delivery-sent-list'), 'warehouse-mobile must support delivery-sent-list');
assert(
  mobile.includes('mobileSentDeliverySessionEligible'),
  'sent list must include repair/order deliveries from Delivery app',
);
assert(
  mobile.includes('order_delivery'),
  'order queue submit must tag sessions for sent list',
);
assert(
  mobile.includes('sold_delivery'),
  'sent list must include sold warehouse storage deliveries',
);
assert(
  fs.readFileSync(path.join(root, 'server/lib/warehouseStorageSends.js'), 'utf8').includes('listStorageSendsForSentDeliveries'),
  'sold deliveries must merge into sent list',
);
assert(mobile.includes('delivery-sent-detail'), 'warehouse-mobile must support delivery-sent-detail');
assert(mobile.includes('evaluateWarehouseDeliveryDriverAppAccess'), 'delivery API must use evaluateWarehouseDeliveryDriverAppAccess');
assert(
  fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSentDeliveriesScreen.js'))
    || fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSentDeliveriesScreen.js')),
  'Delivery app must include sent deliveries list screen',
);
assert(
  fs.existsSync(path.join(root, 'mobile-apps/warehouse-delivery/App.js')),
  'Warehouse Delivery driver app must exist',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/warehouse-delivery/App.js'), 'utf8').includes('KitweSendHomeScreen'),
  'Warehouse Delivery app must register Kitwe send flow',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/shared/mobileAccessManifest.js'), 'utf8')
    .includes('evaluateWarehouseDeliveryDriverAppAccess'),
  'mobile-apps/shared manifest must export driver delivery access helper',
);
assert(
  fs.readFileSync(path.join(root, 'mobile-apps/warehouse-delivery/deliveryKit/screens/KitweSendSignatureScreen.js'), 'utf8')
    .includes("'delivery-submit'"),
  'driver app must submit signed delivery to warehouse-mobile',
);
assert(
  fs.readFileSync(path.join(root, 'src/WarehouseDeliveries.js'), 'utf8')
    .includes('acceptWarehouseDeliverySession'),
  'Hassan deliveries page must accept received lines',
);
assert(
  readKitweSendHomeScreenSource().includes('filterAssembliesForDeliveryWarehouse'),
  'Kitwe send must filter to warehouse-products catalog scope',
);
assert(
  fs.readFileSync(path.join(root, 'src/components/DeliveryUserAccessEditor.js'), 'utf8')
    .includes('warehouse_delivery_app'),
  'User Access must include Delivery app editor',
);
const upholsteryEditor = path.join(root, 'src/components/UpholsteryUserAccessEditor.js');
const productionEditor = path.join(root, 'src/components/ProductionUserAccessEditor.js');
assert(
  fs.existsSync(upholsteryEditor) || fs.existsSync(productionEditor),
  'User Access must include Upholstery or Production app editor',
);
if (fs.existsSync(upholsteryEditor)) {
  assert(
    fs.readFileSync(upholsteryEditor, 'utf8').includes('warehouse_production_app'),
    'Upholstery User Access editor must toggle warehouse_production_app',
  );
  assert(!fs.existsSync(productionEditor), 'Remove ProductionUserAccessEditor when Upholstery editor is present');
}
execSync('node scripts/verifyDeliveryWarehouseCatalog.js', { cwd: root, stdio: 'pipe' });
const deliveryAppRoot = path.join(root, 'mobile-apps/warehouse-delivery');
const deliveryKitMaterialized = fs.existsSync(
  path.join(deliveryAppRoot, 'deliveryKit', '.standalone-materialized'),
);
if (deliveryKitMaterialized) {
  execSync('node scripts/verifyDeliveryApp.js', {
    cwd: deliveryAppRoot,
    stdio: 'pipe',
  });
} else {
  console.log('verifyWarehouseDeliveryFlow: skip verifyDeliveryApp (run npm run materialize in warehouse-delivery locally)');
}
assert(noteHtml.includes('DELIVERY_NOTE_DISCLAIMER'), 'delivery note must include disclaimer');
assert(
  noteHtml.includes("'sold_delivery'") && noteHtml.includes("'Delivery Note'"),
  'A4 must keep separate titles for sold_delivery vs kitwe delivery',
);

execSync(
  `node --input-type=module -e "
import { buildDeliveryPrintGroupsFromEntries } from './src/utils/warehouseDeliveryPrintGroups.js';
import { buildDeliveryNotePrintHtml } from './src/utils/buildDeliveryNotePrintHtml.js';
const groups = buildDeliveryPrintGroupsFromEntries([{
  kind: 'assembly',
  name: 'Bowl Single Seater',
  quantity: 1,
  metadata: { assembly_name: 'Bowl Single Seater', finished_unit: true, units: 1 },
}]);
if (groups[0].lines.length !== 0) throw new Error('finished unit must not add packet sub-rows');
const html = buildDeliveryNotePrintHtml({ deliveryNumber: 'WHD1', driverName: 'D', printGroups: groups, documentKind: 'delivery' });
if (html.includes('- Bowl Single Seater')) throw new Error('delivery note must not duplicate product as packet line');
"`,
  { cwd: root, stdio: 'pipe' },
);

execSync(
  `node --input-type=module -e "
import { sanitizeDeliveryNotePrintGroups } from './src/utils/warehouseDeliveryPrintGroups.js';
const groups = sanitizeDeliveryNotePrintGroups([{ assembly_name: 'Aria 2 Seater', units: 1, lines: [] }]);
if (groups[0].elapsed_display !== '—') throw new Error('missing elapsed_display must become em dash, not undefined');
if (JSON.stringify(groups).includes('undefined')) throw new Error('sanitized print groups must not serialize undefined');
"`,
  { cwd: root, stdio: 'pipe' },
);

execSync(
  `node --input-type=module -e "
import { printGroupsFromQuoteLines, whatsAppProductGroupsFromPrintGroups } from './src/utils/warehouseDeliveryPrintGroups.js';
import { buildDeliveryNotePrintHtml } from './src/utils/buildDeliveryNotePrintHtml.js';
import { buildWarehouseDeliveryWhatsAppMessage } from './src/utils/buildWarehouseDeliveryWhatsAppMessage.js';
const quoteGroups = printGroupsFromQuoteLines([{
  name: 'wardrobe (bedroom)',
  quantity: 1,
  wood: 'Mukwa',
  color_code: 'LAG890',
  accessories: ['Granite', 'Sink'],
}]);
if (quoteGroups[0].assembly_name !== 'wardrobe (bedroom)') throw new Error('quote print group must use line name');
if (!quoteGroups[0].lines.some((l) => l.name === 'Mukwa')) throw new Error('quote print group must include wood field');
if (!quoteGroups[0].lines.some((l) => String(l.name).includes('LAG890'))) throw new Error('quote print group must include color field');
if (!quoteGroups[0].lines.some((l) => l.name === 'Granite, Sink')) throw new Error('quote print group must join accessory options');
const quoteHtml = buildDeliveryNotePrintHtml({
  deliveryNumber: 'QT#322',
  driverName: 'Jane',
  printGroups: quoteGroups,
  documentKind: 'order_delivery',
  customerName: 'walk in',
  customerPhone: '+2600961222333',
});
if (!quoteHtml.includes('wardrobe (bedroom)')) throw new Error('order note must show quote product');
if (!quoteHtml.includes('-Mukwa')) throw new Error('order note must show quote field as dash line');
if (!quoteHtml.includes('-Granite, Sink')) throw new Error('order note must show accessory options');
if (quoteHtml.includes('Aria 2 Seater')) throw new Error('order note must not use catalog fallback');
const waGroups = whatsAppProductGroupsFromPrintGroups(quoteGroups);
const wa = buildWarehouseDeliveryWhatsAppMessage({
  title: 'Order delivery',
  productGroups: waGroups,
  totalProducts: 1,
});
if (!wa.includes('wardrobe (bedroom) * 1')) throw new Error('order WhatsApp must use quote product name');
if (!wa.includes('-Mukwa')) throw new Error('order WhatsApp must include quote fields');
if (wa.includes('-Mukwa *')) throw new Error('order WhatsApp field lines must not show packet qty');
if (wa.includes('Aria 2 Seater')) throw new Error('order WhatsApp must not use catalog fallback');
"`,
  { cwd: root, stdio: 'pipe' },
);

execSync(
  `node --input-type=module -e "
import { buildDeliveryNotePrintHtml } from './src/utils/buildDeliveryNotePrintHtml.js';
const groups = [{ assembly_name: 'Test', units: 1, lines: [] }];
const d = buildDeliveryNotePrintHtml({ deliveryNumber: 'WHD1', driverName: 'D', printGroups: groups, documentKind: 'delivery' });
if (!d.includes('<h1 class=\\"title\\">Delivery Note</h1>')) throw new Error('delivery header missing');
if (d.includes('Sold Delivery Note')) throw new Error('kitwe delivery must not use Sold Delivery Note');
if (d.includes('Customer Name:')) throw new Error('kitwe delivery must not show customer block');
if (d.includes('Dispatched by:')) throw new Error('delivery note must not show Dispatched by');
const s = buildDeliveryNotePrintHtml({ deliveryNumber: 'WST0000000001', driverName: 'D', printGroups: groups, documentKind: 'sold_delivery', customerName: 'Test', customerPhone: '123' });
if (!s.includes('<h1 class=\\"title\\">Sold Delivery Note</h1>')) throw new Error('sold header missing');
if (!s.includes('Customer Name:')) throw new Error('sold delivery must show customer block');
if (s.includes('Dispatched by:')) throw new Error('sold note must not show Dispatched by');
const o = buildDeliveryNotePrintHtml({ deliveryNumber: 'QT#322', driverName: 'Jane', driverPhone: '0977', printGroups: groups, documentKind: 'order_delivery', customerName: 'walk in', customerPhone: '+2600961222333' });
if (o.includes('Dispatched by:')) throw new Error('order note must not show Dispatched by');
if (!o.includes('Customer Name:') || !o.includes('walk in')) throw new Error('order delivery must show customer name');
if (!o.includes('Customer Phone Number:') || !o.includes('+2600961222333')) throw new Error('order delivery must show customer phone');
if (!o.includes('Driver Name:') || !o.includes('Jane')) throw new Error('order delivery must show driver name');
if (!o.includes('Driver Phone Number:') || !o.includes('0977')) throw new Error('order customer-driver must show driver phone');
const fleet = buildDeliveryNotePrintHtml({ deliveryNumber: 'WHD1', driverName: 'Fleet', printGroups: groups, documentKind: 'delivery' });
if (fleet.includes('Driver Phone Number:')) throw new Error('fleet driver must not show driver phone');
if (!fleet.includes('Driver Name:')) throw new Error('floor 1 note must show driver name');
const r = buildDeliveryNotePrintHtml({ deliveryNumber: 'RO1', driverName: 'D', printGroups: groups, documentKind: 'return_shipment' });
if (!r.includes('<h1 class=\\"title\\">Return Note</h1>')) throw new Error('return header missing');
"`,
  { cwd: root, stdio: 'pipe' },
);

const fulfillmentPage = fs.readFileSync(path.join(root, 'src/FulfillmentFloor1DeliveryPage.js'), 'utf8');
assert(fulfillmentPage.includes('submitWarehouseDelivery'), 'fulfillment temp page must submit via warehouse-mobile');
assert(fulfillmentPage.includes('FULFILLMENT_WEB_DRIVER_NAME'), 'fulfillment temp page must use web driver placeholder');
assert(
  fs.readFileSync(path.join(root, 'src/AppChrome.js'), 'utf8').includes('/fulfillment-floor1-delivery'),
  'fulfillment nav must link temporary Floor 1 delivery page',
);

console.log('verifyWarehouseDeliveryFlow: ok');
