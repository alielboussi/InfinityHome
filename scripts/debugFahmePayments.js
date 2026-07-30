#!/usr/bin/env node
/**
 * Diagnose Mohammad Fahme payment rows — especially 28 Jul 2026 $20,000.
 * Usage: node scripts/debugFahmePayments.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FAHME_IDS = [
  'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  'efb21cad-1a8d-4d64-9487-51e816fcb429',
];

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing REACT_APP_SUPABASE_URL and key');
  process.exit(1);
}

const supabase = createClient(url, key);

function fmt(row) {
  return {
    id: row?.id,
    sale_id: row?.sale_id,
    customer_id: row?.customer_id,
    amount: row?.amount,
    payment_date: row?.payment_date,
    payment_type: row?.payment_type,
    reference: row?.reference,
    notes: row?.notes,
    allocation_batch_uuid: row?.allocation_batch_uuid,
  };
}

async function main() {
  for (const customerId of FAHME_IDS) {
    console.log('\n========== CUSTOMER', customerId, '==========');
    const { data: customer } = await supabase.from('customers').select('id, name').eq('id', customerId).maybeSingle();
    console.log('Name:', customer?.name || '(not found)');

    const { data: sales } = await supabase.from('sales').select('id, sale_date, status, layby_id, total_amount').eq('customer_id', customerId);
    const saleIds = (sales || []).map((s) => s.id).filter(Boolean);
    console.log('Sales count:', saleIds.length);

    const { data: laybyPay } = await supabase
      .from('layby_payments')
      .select('id, sale_id, customer_id, amount, payment_date, payment_type, reference, notes, allocation_batch_uuid')
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: true });
    console.log('\nlayby_payments by customer_id:', (laybyPay || []).length);
    (laybyPay || []).forEach((row) => console.log('  ', JSON.stringify(fmt(row))));

    if (saleIds.length) {
      const { data: laybyBySale } = await supabase
        .from('layby_payments')
        .select('id, sale_id, customer_id, amount, payment_date, payment_type, reference, notes, allocation_batch_uuid')
        .in('sale_id', saleIds)
        .order('payment_date', { ascending: true });
      console.log('\nlayby_payments by sale_ids:', (laybyBySale || []).length);

      const { data: salesPay } = await supabase
        .from('sales_payments')
        .select('id, sale_id, amount, payment_date, payment_type, reference, notes, allocation_batch_uuid')
        .in('sale_id', saleIds)
        .order('payment_date', { ascending: true });
      console.log('\nsales_payments by sale_ids:', (salesPay || []).length);
      (salesPay || []).forEach((row) => console.log('  ', JSON.stringify(fmt(row))));

      const jul28 = (salesPay || []).filter((row) => String(row?.payment_date || '').includes('2026-07-28'));
      const amount20k = (salesPay || []).filter((row) => Math.abs(Number(row?.amount || 0) - 20000) < 0.01);
      console.log('\nJuly 28 sales_payments:', jul28.length);
      jul28.forEach((row) => console.log('  ', JSON.stringify(fmt(row))));
      console.log('$20k sales_payments:', amount20k.length);
      amount20k.forEach((row) => console.log('  ', JSON.stringify(fmt(row))));
    }

    const recent = [...(laybyPay || [])].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date))).slice(0, 5);
    console.log('\nMost recent layby_payments:');
    recent.forEach((row) => console.log('  ', JSON.stringify(fmt(row))));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
