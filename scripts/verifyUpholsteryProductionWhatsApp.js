import { buildUpholsteryProductionWhatsAppText } from '../server/lib/upholsteryProductionWhatsAppMessage.js';

const at = new Date('2026-11-25T07:46:00.000Z');

const debit = buildUpholsteryProductionWhatsAppText({
  kind: 'floor2Debit',
  producedBy: 'Workshop User',
  products: [{ name: 'Stella 3 Seater', qty: 2, remainingQty: 5 }],
  printedAt: at,
});

if (!debit.includes('Date: 25 / 11 / 2026')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit date', debit);
  process.exit(1);
}
if (!debit.includes('CAT (GMT+2)')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit timezone');
  process.exit(1);
}
if (!debit.includes('User: Workshop User')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit user');
  process.exit(1);
}
if (!debit.includes('Stella 3 Seater (2) / (Remaining Qty: 5 )')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit product', debit);
  process.exit(1);
}
if (debit.includes('Status:')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit must not include Status');
  process.exit(1);
}
if (debit.includes('Customer Name:')) {
  console.error('[verifyUpholsteryProductionWhatsApp] debit must not include customer');
  process.exit(1);
}

const hassanPartial = buildUpholsteryProductionWhatsAppText({
  kind: 'orderComplete',
  orderSource: 'hassan',
  producedBy: 'Alias',
  customerName: 'Jane Doe',
  customerPhone: '0971234567',
  products: [{ name: 'Chair', qty: 1, remainingQty: 2 }],
  printedAt: at,
});

if (!hassanPartial.includes('Customer Name: Jane Doe')) {
  console.error('[verifyUpholsteryProductionWhatsApp] hassan customer');
  process.exit(1);
}
if (!hassanPartial.includes('Customer Phone Number: 0971234567')) {
  console.error('[verifyUpholsteryProductionWhatsApp] hassan phone');
  process.exit(1);
}
if (!hassanPartial.includes('Status: Partial')) {
  console.error('[verifyUpholsteryProductionWhatsApp] hassan partial status');
  process.exit(1);
}
if (!hassanPartial.includes('(Remaining Qty: 2 )')) {
  console.error('[verifyUpholsteryProductionWhatsApp] hassan remaining');
  process.exit(1);
}

const mfgDone = buildUpholsteryProductionWhatsAppText({
  kind: 'orderComplete',
  orderSource: 'manufacture',
  producedBy: 'Alias',
  customerName: 'Should Hide',
  products: [{ name: 'Ottoman', qty: 3, remainingQty: 0 }],
  status: 'Completed',
  printedAt: at,
});

if (mfgDone.includes('Customer Name:')) {
  console.error('[verifyUpholsteryProductionWhatsApp] manufacture must omit customer');
  process.exit(1);
}
if (!mfgDone.includes('Status: Completed')) {
  console.error('[verifyUpholsteryProductionWhatsApp] manufacture completed');
  process.exit(1);
}
if (mfgDone.includes('Remaining Qty')) {
  console.error('[verifyUpholsteryProductionWhatsApp] completed must omit remaining');
  process.exit(1);
}
if (!mfgDone.includes('Ottoman (3)')) {
  console.error('[verifyUpholsteryProductionWhatsApp] manufacture product');
  process.exit(1);
}

console.log('[verifyUpholsteryProductionWhatsApp] ok');
