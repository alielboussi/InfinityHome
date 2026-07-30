#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FAHME_ID = 'd8e756ae-b8ea-4f90-b99a-70c1120f52b9';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function main() {
  const { data: laybyRows } = await supabase.from('laybys').select('id, sale_id, status, notes').eq('customer_id', FAHME_ID);
  const laybyIds = new Set((laybyRows || []).map((r) => String(r.id)));
  const laybySaleIds = new Set((laybyRows || []).map((r) => String(r.sale_id)));

  const { data: salesRows } = await supabase.from('sales').select('id, sale_date, currency, status, layby_id').eq('customer_id', FAHME_ID);
  const laybySales = (salesRows || []).filter((sale) => {
    const saleId = String(sale.id || '');
    const laybyId = String(sale.layby_id || '');
    const status = String(sale.status || '').trim().toLowerCase();
    return status === 'layby' || laybyIds.has(laybyId) || laybySaleIds.has(saleId);
  });
  const saleIds = laybySales.map((s) => s.id);
  console.log('laybySales:', laybySales.length, 'saleIds:', saleIds.length);
  console.log('July sales in laybySales:', laybySales.filter((s) => [1022, 1023, 1024, 1025, 1026].includes(Number(s.id))).map((s) => s.id));

  const { data: laybyByCustomer } = await supabase
    .from('layby_payments')
    .select('id, sale_id, amount, payment_date, allocation_batch_uuid, notes, reference')
    .eq('customer_id', FAHME_ID)
    .gte('payment_date', '2026-07-01')
    .order('payment_date', { ascending: true });
  console.log('\nJuly+ 2026 layby_payments:', (laybyByCustomer || []).length);
  (laybyByCustomer || []).forEach((r) => console.log(' ', r.sale_id, r.amount, r.payment_date, r.allocation_batch_uuid?.slice(0, 8)));

  const notes = (laybyRows || []).map((r) => r.notes).filter(Boolean);
  console.log('\nLayby notes sample:', notes.slice(0, 3));
  console.log('Any PDF_ITEM_RESTORE in notes:', notes.some((n) => String(n).includes('PDF_ITEM_RESTORE')));
}

main();
