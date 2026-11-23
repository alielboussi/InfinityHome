/**
 * Hassan customer orders: quotationer products only + Zambia 9-digit phone.
 * Showroom orders: Floor 2 stock only.
 * Usage: node scripts/verifyHassanOrderCatalog.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertZambiaNationalPhone } from '../src/utils/zambiaPhoneDigits.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

try {
  assertZambiaNationalPhone('097123456', '+260');
  let threw = false;
  try {
    assertZambiaNationalPhone('09712345', '+260');
  } catch {
    threw = true;
  }
  assert(threw, 'short Zambia numbers must fail');

  const create = read('src/Quotationer.js');
  assert(create.includes('Customer orders can only use products from Quotationer'), 'customer create must block Floor 2 products');
  assert(create.includes('assertZambiaNationalPhone'), 'customer phone must validate 9 national digits');

  const send = read('src/services/sendQuoteOrderFlow.js');
  assert(send.includes('assertCustomerOrderCatalogLines'), 'send order must enforce catalog-only customer lines');
  assert(send.includes('assertShowroomOrderFloor2Lines'), 'send order must enforce Floor 2 showroom lines');
  assert(send.includes('assertCustomerOrderZambiaPhone'), 'send order must enforce Zambia phone');

  const showroom = read('src/components/HassanShowroomOrderForm.js');
  assert(!showroom.includes('Showroom orders can only use products with Floor 2 stock.'), 'showroom must allow qty 0');
  assert(showroom.includes('Lines can be added at stock 0'), 'showroom helper must mention qty 0');

  console.log('verifyHassanOrderCatalog: OK');
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
}
