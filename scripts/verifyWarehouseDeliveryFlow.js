/**
 * Static checks for Factory → Kitwe mobile delivery + Hassan receiver flow.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const mobile = fs.readFileSync(path.join(root, 'server/handlers/warehouse-mobile.js'), 'utf8');
const deliveries = fs.readFileSync(path.join(root, 'src/WarehouseDeliveries.js'), 'utf8');

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
  fs.readFileSync(path.join(root, 'api/notify.js'), 'utf8').includes('deliverWarehouseDeliveryGroupMessage'),
  'notify must export deliverWarehouseDeliveryGroupMessage for delivery submit',
);
assert(mobile.includes('whatsapp_sent_at'), 'delivery submit must record whatsapp_sent_at on success');
assert(!deliveries.includes('receiverTestMirror'), 'WarehouseDeliveries must not include Hassan test mirror');
assert(
  deliveries.includes('warehouseDeliveryReceiverLineKind'),
  'Hassan page must render finished-unit delivery lines (not packet_id only)',
);
assert(
  fs.readFileSync(path.join(root, 'src/utils/warehouseDelivery.js'), 'utf8').includes('deliveryEntryReceivable'),
  'receiver progress must count finished-unit assembly lines',
);
assert(deliveries.includes('WAREHOUSE_RECEIVER_LIST_STATUSES'), 'Hassan page must load completed deliveries for history');
assert(!deliveries.includes('prev.filter((s) => String(s.id)'), 'Hassan page must not remove cards when accept completes');
assert(mobile.includes('admin_registry'), 'return/storage list must support admin registry');
assert(mobile.includes('driver_signature_url'), 'delivery submit must store driver signature url');
assert(mobile.includes('delivery-cancel'), 'warehouse-mobile must support delivery-cancel');
assert(mobile.includes('delivery-draft-discard'), 'warehouse-mobile must discard failed delivery drafts');
assert(mobile.includes('deleteWarehouseDeliverySessionHard'), 'failed delivery submit must hard-delete draft');
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
  fs.readFileSync(path.join(root, 'storage.rules'), 'utf8').includes('warehouse-delivery-signatures'),
  'storage rules must allow warehouse-delivery-signatures',
);


const chrome = fs.readFileSync(path.join(root, 'src/AppChrome.js'), 'utf8');
assert(chrome.includes('/warehouse-deliveries-admin'), 'inventory nav must include Deliveries');
assert(
  fs.readFileSync(path.join(root, 'src/WarehouseDeliveriesAdmin.js'), 'utf8').includes('sendWarehouseDeliveryWhatsApp'),
  'Deliveries admin must support resend WhatsApp with delivery note PDF',
);
assert(chrome.includes('/warehouse-repairs-admin'), 'inventory nav must include Repairs');
assert(chrome.includes('/warehouse-sales-storage-admin'), 'inventory nav must include Sales Storage');
assert(!chrome.includes('warehouse-deliveries-hassan-test'), 'Hassan mirror test route must be removed');

const noteHtml = fs.readFileSync(path.join(root, 'src/utils/buildDeliveryNotePrintHtml.js'), 'utf8');
assert(noteHtml.includes('company-logo'), 'delivery note HTML must include company logo');
assert(noteHtml.includes('company-name'), 'delivery note must show company name under Delivery Note');
assert(noteHtml.includes('Bestrest Furniture'), 'delivery note must show Bestrest Furniture');
assert(
  fs.existsSync(path.join(root, 'src/utils/deliveryNoteCompanyLogoEmbedded.js')),
  'embedded delivery note logo must exist (run node scripts/embedDeliveryNoteLogo.js)',
);
const deliveryPdf = fs.readFileSync(path.join(root, 'src/utils/warehouseDeliveryPdf.js'), 'utf8');
assert(deliveryPdf.includes('deliverySenderName'), 'warehouse delivery PDF must show app name not email');
assert(noteHtml.includes('Page ${pageIndex} of ${pageTotal}'), 'delivery note must show page numbers');
assert(mobile.includes('delivery-sent-list'), 'warehouse-mobile must support delivery-sent-list');
assert(mobile.includes('delivery-sent-detail'), 'warehouse-mobile must support delivery-sent-detail');
assert(
  fs.existsSync(path.join(root, 'mobile-apps/warehouse-production/screens/KitweSentDeliveriesScreen.js')),
  'Production app must include sent deliveries list screen',
);
assert(noteHtml.includes('DELIVERY_NOTE_DISCLAIMER'), 'delivery note must include disclaimer');
assert(
  noteHtml.includes("'sold_delivery'") && noteHtml.includes("'Delivery Note'"),
  'A4 must keep separate titles for sold_delivery vs kitwe delivery',
);

const { execSync } = require('child_process');
execSync(
  `node --input-type=module -e "
import { buildDeliveryNotePrintHtml } from './src/utils/buildDeliveryNotePrintHtml.js';
const groups = [{ assembly_name: 'Test', units: 1, lines: [] }];
const d = buildDeliveryNotePrintHtml({ deliveryNumber: 'WHD1', driverName: 'D', printGroups: groups, documentKind: 'delivery' });
if (!d.includes('<h1 class=\\"title\\">Delivery Note</h1>')) throw new Error('delivery header missing');
if (d.includes('Sold Delivery Note')) throw new Error('kitwe delivery must not use Sold Delivery Note');
if (d.includes('Customer Name:')) throw new Error('kitwe delivery must not show customer block');
const s = buildDeliveryNotePrintHtml({ deliveryNumber: 'WST0000000001', driverName: 'D', printGroups: groups, documentKind: 'sold_delivery', customerName: 'Test', customerPhone: '123' });
if (!s.includes('<h1 class=\\"title\\">Sold Delivery Note</h1>')) throw new Error('sold header missing');
if (!s.includes('Customer Name:')) throw new Error('sold delivery must show customer block');
const r = buildDeliveryNotePrintHtml({ deliveryNumber: 'RO1', driverName: 'D', printGroups: groups, documentKind: 'return_shipment' });
if (!r.includes('<h1 class=\\"title\\">Return Note</h1>')) throw new Error('return header missing');
"`,
  { cwd: root, stdio: 'pipe' },
);

console.log('verifyWarehouseDeliveryFlow: ok');
