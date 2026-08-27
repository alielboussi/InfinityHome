/** Basyouni & Congo Cash Book — ledger / Basyouni customer notifications */
export const BASYOUNI_CASH_BOOK_GROUP_ID = '120363246815974105@g.us';

const FAHME_IDS = [
  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
];

const BASYOUNI_NAME_PATTERN = /\bbasyouni\b/i;

export function isFahme(customerId) {
  if (!customerId) return false;
  const key = String(customerId).trim().toLowerCase();
  return FAHME_IDS.some((id) => String(id).toLowerCase() === key);
}

export function isBasyouniCustomer(customerId, customerName) {
  const name = String(customerName || '').trim();
  if (BASYOUNI_NAME_PATTERN.test(name)) return true;
  const envId = String(
    (typeof process !== 'undefined' && process.env?.BASYOUNI_CUSTOMER_ID)
    || '',
  ).trim().toLowerCase();
  if (envId && customerId && String(customerId).trim().toLowerCase() === envId) return true;
  return false;
}

/** POS sales + layby down payments for Basyouni route to the cash-book group. */
export function usesCashBookWhatsAppRouting(customerId, customerName) {
  return isBasyouniCustomer(customerId, customerName);
}

/** Compact down-payment text for Basyouni + both Fahme accounts. */
export function usesCompactDownpaymentWhatsApp(customerId, customerName) {
  return isFahme(customerId) || isBasyouniCustomer(customerId, customerName);
}
