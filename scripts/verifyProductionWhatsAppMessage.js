/**
 * Warehouse production WhatsApp alert body (CAT date/time, qty / stock on hand rules).
 */
import { buildWarehouseProductionWhatsAppText } from '../server/lib/warehouseProductionWhatsAppMessage.js';

const at = new Date('2026-10-27T12:49:00.000Z');

const newMsg = buildWarehouseProductionWhatsAppText({
  variant: 'new',
  accountAlias: 'Test User',
  sku: 'ABC123',
  name: 'Stella Single Seater',
  qtyAdded: 2,
  printedAt: at,
});

if (!newMsg.includes('***New Product***')) {
  console.error('[verifyProductionWhatsAppMessage] missing new header');
  process.exit(1);
}
if (!newMsg.includes('Location: 1st Floor Warehouse')) {
  console.error('[verifyProductionWhatsAppMessage] missing location');
  process.exit(1);
}
if (newMsg.includes('Stock On Hand')) {
  console.error('[verifyProductionWhatsAppMessage] new product must not include Stock On Hand');
  process.exit(1);
}
if (!newMsg.includes('Qty: 2')) {
  console.error('[verifyProductionWhatsAppMessage] bad qty on new product');
  process.exit(1);
}

const existingWithPrior = buildWarehouseProductionWhatsAppText({
  variant: 'existing',
  accountAlias: 'Test User',
  sku: 'ABC123',
  name: 'Stella Single Seater',
  qtyAdded: 3,
  qtyBefore: 2,
  qtyOnHand: 5,
  printedAt: at,
});

if (!existingWithPrior.includes('***Existing Product***')) {
  console.error('[verifyProductionWhatsAppMessage] missing existing header');
  process.exit(1);
}
if (!existingWithPrior.includes('Qty: 3') || !existingWithPrior.includes('Stock On Hand: 5')) {
  console.error('[verifyProductionWhatsAppMessage] existing stock lines wrong:', existingWithPrior);
  process.exit(1);
}

const existingFromZero = buildWarehouseProductionWhatsAppText({
  variant: 'existing',
  qtyAdded: 1,
  qtyBefore: 0,
  qtyOnHand: 1,
  sku: 'X',
  name: 'Y',
  printedAt: at,
});

if (existingFromZero.includes('Stock On Hand')) {
  console.error('[verifyProductionWhatsAppMessage] must omit Stock On Hand when qtyBefore is 0');
  process.exit(1);
}

console.log('[verifyProductionWhatsAppMessage] ok');
