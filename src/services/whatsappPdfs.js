import supabase from '../supabase';
import generateLaybyPdf from '../laybyPdf';
import { fetchLaybyStatement } from './laybyStatement';
import { computePooledLaybyTotalsByCurrency } from '../utils/laybyRollup';
import { isFahme } from '../laybyRules';

function safeFilePart(value, fallback = 'Customer') {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim();
  return cleaned || fallback;
}

export async function uploadPdfToStorage(bucket, filePath, blob) {
  if (!blob) return null;
  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { upsert: true, contentType: 'application/pdf' });
  if (uploadErr) throw uploadErr;
  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return publicUrlData?.publicUrl || null;
}

export async function buildLaybyPdfUrlForWhatsApp({ laybyId, customerId, laybySnapshot } = {}) {
  try {
    const resolvedCustomerId = customerId || laybySnapshot?.customer_id;
    if (!resolvedCustomerId) return null;

    let statement = laybySnapshot?.statement || laybySnapshot?.fullStatement || null;
    if (!statement || (!statement.sales?.length && !statement.items?.length && !statement.payments?.length)) {
      const { data: statementRes } = await fetchLaybyStatement(resolvedCustomerId);
      if (statementRes) {
        statement = {
          sales: statementRes?.sales || [],
          items: statementRes?.items || [],
          payments: statementRes?.payments || [],
        };
      }
    }

    const base = laybySnapshot?.primaryLayby || laybySnapshot || { id: laybyId, customer_id: resolvedCustomerId };
    let customerInfo = laybySnapshot?.customerInfo || laybySnapshot?.customer || {};
    if (!customerInfo?.name && resolvedCustomerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, name, phone, address, city, tpin, currency')
        .eq('id', resolvedCustomerId)
        .maybeSingle();
      customerInfo = customer || customerInfo;
    }

    const pdfLayby = {
      ...base,
      id: laybyId || base.id,
      sale_id: null,
      customer_id: resolvedCustomerId,
      customerInfo: laybySnapshot?.customerInfo || laybySnapshot?.customer || customerInfo || {},
    };

    const blob = await generateLaybyPdf(pdfLayby, {
      mode: 'blob',
      ...(statement ? { statement } : {}),
      ...(isFahme(resolvedCustomerId) && statement
        ? { totalsByCurrency: computePooledLaybyTotalsByCurrency(statement) }
        : {}),
    });
    if (!blob) return null;

    const customerName = pdfLayby.customerInfo?.name || 'Customer';
    const filePath = `laybys/${laybyId || base.id || resolvedCustomerId}.pdf`;
    const url = await uploadPdfToStorage('laybypdfs', filePath, blob);
    if (!url) return null;

    return {
      url,
      filename: `${safeFilePart(customerName)}_Layby_Statement.pdf`,
    };
  } catch (e) {
    console.warn('Layby PDF for WhatsApp failed:', e?.message || e);
    return null;
  }
}

export async function buildPosSalePdfUrlForWhatsApp({ saleId } = {}) {
  if (saleId == null || String(saleId).trim() === '') return null;
  try {
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('id, customer_id, sale_date, created_at, total_amount, currency, receipt_number, discount')
      .eq('id', saleId)
      .maybeSingle();
    if (saleErr || !sale) return null;

    const [{ data: items }, { data: payments }, { data: customer }] = await Promise.all([
      supabase
        .from('sales_items')
        .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
        .eq('sale_id', sale.id),
      supabase
        .from('sales_payments')
        .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes, currency')
        .eq('sale_id', sale.id)
        .order('payment_date', { ascending: true }),
      sale.customer_id
        ? supabase.from('customers').select('id, name, phone, address, city, tpin, currency').eq('id', sale.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const paidAmount = (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalDue = Number(sale.total_amount || 0);
    const outstandingAmount = Math.max(0, totalDue - paidAmount);
    const statement = {
      sales: [{
        sale_id: sale.id,
        id: sale.id,
        sale_date: sale.sale_date || sale.created_at,
        currency: sale.currency,
        total_due: totalDue,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
        subtotal_before_discount: Number(sale.total_amount || 0) + Number(sale.discount || 0),
        discount_amount: Number(sale.discount || 0),
      }],
      items: (items || []).map((item) => ({
        sale_id: item.sale_id,
        product_id: item.product_id,
        display_name: item.display_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency: item.currency,
        color: item.color,
      })),
      payments: (payments || []).map((payment) => ({
        ...payment,
        payment_type: String(payment.payment_type || '').toLowerCase(),
      })),
    };

    const pdfLayby = {
      id: sale.id,
      sale_id: sale.id,
      customer_id: sale.customer_id,
      customerInfo: customer || {},
      currency: sale.currency,
    };

    const blob = await generateLaybyPdf(pdfLayby, {
      mode: 'blob',
      statement,
      posReceipt: true,
    });
    if (!blob) return null;

    const customerName = customer?.name || 'Customer';
    const filePath = `sales/${sale.id}.pdf`;
    const url = await uploadPdfToStorage('laybypdfs', filePath, blob);
    if (!url) return null;

    return {
      url,
      filename: `${safeFilePart(customerName)}_Sales_Receipt.pdf`,
    };
  } catch (e) {
    console.warn('POS sale PDF for WhatsApp failed:', e?.message || e);
    return null;
  }
}

function openPdfBlobInNewTab(blob) {
  if (!blob || typeof window === 'undefined') return false;
  const url = URL.createObjectURL(blob);
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (!tab) {
    URL.revokeObjectURL(url);
    return false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return true;
}

function buildSamplePosSaleStatement() {
  const now = new Date().toISOString();
  return {
    sales: [{
      sale_id: 'sample-sale',
      id: 'sample-sale',
      sale_date: now,
      created_at: now,
      currency: 'K',
      receipt_number: '4250',
      total_due: 36000,
      paid_amount: 36000,
      outstanding_amount: 0,
      subtotal_before_discount: 36000,
      discount_amount: 0,
    }],
    items: [
      {
        sale_id: 'sample-sale',
        display_name: 'Dining Table',
        quantity: 1,
        unit_price: 18000,
        currency: 'K',
      },
      {
        sale_id: 'sample-sale',
        display_name: 'Dining Chair',
        quantity: 6,
        unit_price: 3000,
        currency: 'K',
      },
    ],
    payments: [{
      sale_id: 'sample-sale',
      amount: 36000,
      payment_type: 'cash',
      payment_date: now,
      reference: '4250',
      currency: 'K',
    }],
  };
}

function buildSampleLaybyStatement() {
  const now = new Date().toISOString();
  return {
    sales: [{
      sale_id: 'sample-sale',
      id: 'sample-sale',
      sale_date: now,
      currency: 'K',
      receipt_number: '4250',
      total_due: 36000,
      paid_amount: 10000,
      outstanding_amount: 26000,
      subtotal_before_discount: 36000,
      discount_amount: 0,
    }],
    items: [
      {
        sale_id: 'sample-sale',
        display_name: 'Dining Table',
        quantity: 1,
        unit_price: 18000,
        currency: 'K',
      },
      {
        sale_id: 'sample-sale',
        display_name: 'Dining Chair',
        quantity: 6,
        unit_price: 3000,
        currency: 'K',
      },
    ],
    payments: [{
      sale_id: 'sample-sale',
      amount: 10000,
      payment_type: 'cash',
      payment_date: now,
      reference: '4250',
      currency: 'K',
    }],
  };
}

const SAMPLE_CUSTOMER = {
  name: 'Sample Customer',
  phone: '0971234567',
  address: 'Kitwe Showroom Area',
  city: 'Kitwe',
  currency: 'K',
};

export async function previewPosSalePdfSample() {
  const statement = buildSamplePosSaleStatement();
  const blob = await generateLaybyPdf({
    id: 'sample-sale',
    sale_id: 'sample-sale',
    customer_id: 'sample-customer',
    customerInfo: SAMPLE_CUSTOMER,
    currency: 'K',
  }, {
    mode: 'blob',
    statement,
    posReceipt: true,
  });
  return openPdfBlobInNewTab(blob);
}

export async function previewLaybyPdfSample() {
  const statement = buildSampleLaybyStatement();
  const blob = await generateLaybyPdf({
    id: 'sample-layby',
    sale_id: null,
    customer_id: 'sample-customer',
    customerInfo: SAMPLE_CUSTOMER,
    currency: 'K',
  }, {
    mode: 'blob',
    statement,
  });
  return openPdfBlobInNewTab(blob);
}
