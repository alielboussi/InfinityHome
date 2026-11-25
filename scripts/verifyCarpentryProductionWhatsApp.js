import { buildWorkshopProductionWhatsAppText } from '../server/lib/workshopProductionWhatsAppMessage.js';

const at = new Date('2026-11-25T07:46:00.000Z');

const paintingHassan = buildWorkshopProductionWhatsAppText({
  kind: 'sentToPainting',
  orderSource: 'hassan',
  producedBy: 'Alias',
  customerName: 'Jane Doe',
  customerPhone: '0971234567',
  products: [{ name: 'Dining Table', qty: 1, remainingQty: 2 }],
  printedAt: at,
});

if (!paintingHassan.includes('Status: Sent to Painting')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting status', paintingHassan);
  process.exit(1);
}
if (!paintingHassan.includes('From: Hassan Awad order')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting from hassan');
  process.exit(1);
}
if (!paintingHassan.includes('Customer Name: Jane Doe')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting customer');
  process.exit(1);
}
if (!paintingHassan.includes('Dining Table (1) / (Remaining Qty: 2 )')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting remaining', paintingHassan);
  process.exit(1);
}

const paintingMfg = buildWorkshopProductionWhatsAppText({
  kind: 'sentToPainting',
  orderSource: 'manufacture',
  producedBy: 'Alias',
  customerName: 'Hide Me',
  products: [{ name: 'Bed Frame', qty: 2, remainingQty: 0 }],
  printedAt: at,
});

if (paintingMfg.includes('Customer Name:')) {
  console.error('[verifyCarpentryProductionWhatsApp] manufacture painting must omit customer');
  process.exit(1);
}
if (!paintingMfg.includes('From: Manufacture')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting from manufacture');
  process.exit(1);
}
if (paintingMfg.includes('Remaining Qty')) {
  console.error('[verifyCarpentryProductionWhatsApp] full send omits remaining');
  process.exit(1);
}
if (!paintingMfg.includes('Bed Frame (2)')) {
  console.error('[verifyCarpentryProductionWhatsApp] manufacture product');
  process.exit(1);
}

const debit = buildWorkshopProductionWhatsAppText({
  kind: 'floor2Debit',
  producedBy: 'Alias',
  products: [{ name: 'Chair', qty: 1, remainingQty: 4 }],
  printedAt: at,
});
if (!debit.includes('Chair (1) / (Remaining Qty: 4 )') || debit.includes('Status:')) {
  console.error('[verifyCarpentryProductionWhatsApp] debit', debit);
  process.exit(1);
}

const credit = buildWorkshopProductionWhatsAppText({
  kind: 'floor2Credit',
  producedBy: 'Alias',
  products: [{ name: 'Bed Frame', qty: 2, remainingQty: 7 }],
  printedAt: at,
});
if (!credit.includes('Bed Frame (2) / (Floor 2 Qty: 7 )')) {
  console.error('[verifyCarpentryProductionWhatsApp] credit line', credit);
  process.exit(1);
}
if (credit.includes('Remaining Qty') || credit.includes('Status:')) {
  console.error('[verifyCarpentryProductionWhatsApp] credit must not use remaining/status', credit);
  process.exit(1);
}

const paintDoneFloor1 = buildWorkshopProductionWhatsAppText({
  kind: 'orderComplete',
  orderSource: 'hassan',
  producedBy: 'Alias',
  customerName: 'Jane Doe',
  customerPhone: '0971234567',
  products: [{ name: 'Dining Table', qty: 1, remainingQty: 0 }],
  status: 'Completed',
  destination: 'floor1',
  printedAt: at,
});
if (!paintDoneFloor1.includes('Status: Completed') || !paintDoneFloor1.includes('Stored: Floor 1')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting floor1 complete', paintDoneFloor1);
  process.exit(1);
}

const paintDoneDelivery = buildWorkshopProductionWhatsAppText({
  kind: 'orderComplete',
  orderSource: 'manufacture',
  producedBy: 'Alias',
  products: [{ name: 'Bed Frame', qty: 2, remainingQty: 0 }],
  status: 'Completed',
  destination: 'delivery',
  printedAt: at,
});
if (!paintDoneDelivery.includes('Sent to: Delivery queue') || paintDoneDelivery.includes('Customer Name:')) {
  console.error('[verifyCarpentryProductionWhatsApp] painting delivery complete', paintDoneDelivery);
  process.exit(1);
}

console.log('[verifyCarpentryProductionWhatsApp] ok');
