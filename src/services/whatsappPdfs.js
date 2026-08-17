import db from '../dataClient';
import generateLaybyPdf from '../laybyPdf';
import { fetchLaybyStatement } from './laybyStatement';
import { fetchProductLocationPricesForLocation } from './locationPricing';
import { computePooledLaybyTotalsByCurrency } from '../utils/laybyRollup';
import { computeSaleFinancials } from '../utils/saleFinancials';
import {
  buildLocationPriceMap,
  buildProductPriceMap,
  reconcileSaleItemUnits,
} from '../utils/saleDisplayPricing';
import { isFahme } from '../laybyRules';

function safeFilePart(value, fallback = 'Customer') {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim();
  return cleaned || fallback;
}

const PDF_UPLOAD_BUCKETS = ['laybypdfs', 'labels'];

async function uploadPdfToBucket(bucket, filePath, blob) {
  const { error: uploadErr } = await db.storage
    .from(bucket)
    .upload(filePath, blob, { upsert: true, contentType: 'application/pdf', cacheControl: '3600' });
  if (uploadErr) throw uploadErr;

  const { data: signed, error: signErr } = await db.storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60, { download: filePath.split('/').pop() || 'document.pdf' });
  if (!signErr && signed?.signedUrl) return signed.signedUrl;

  const { data: publicUrlData } = db.storage.from(bucket).getPublicUrl(filePath);
  return publicUrlData?.publicUrl || null;
}

export async function uploadPdfToStorage(bucket, filePath, blob) {
  if (!blob) return null;
  const buckets = [bucket, ...PDF_UPLOAD_BUCKETS.filter((name) => name !== bucket)];
  let lastError = null;
  for (const targetBucket of buckets) {
    try {
      const url = await uploadPdfToBucket(targetBucket, filePath, blob);
      if (url) return url;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('PDF upload failed');
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
      const { data: customer } = await db
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

async function loadPosSaleReceiptData(saleId) {
  const { data: sale, error: saleErr } = await db
    .from('sales')
    .select('id, customer_id, sale_date, created_at, total_amount, currency, receipt_number, discount, location_id')
    .eq('id', saleId)
    .maybeSingle();
  if (saleErr || !sale) return null;

  const [{ data: items }, { data: payments }, { data: customer }] = await Promise.all([
    db
      .from('sales_items')
      .select('sale_id, product_id, display_name, quantity, unit_price, currency, color')
      .eq('sale_id', sale.id),
    db
      .from('sales_payments')
      .select('sale_id, amount, discount_amount, payment_type, payment_date, reference, notes, currency')
      .eq('sale_id', sale.id)
      .order('payment_date', { ascending: true }),
    sale.customer_id
      ? db.from('customers').select('id, name, phone, address, city, tpin, currency').eq('id', sale.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const productIds = new Set(
    (items || []).map((item) => item.product_id).filter(Boolean).map(String),
  );
  const [{ data: products }, locationPriceRows] = await Promise.all([
    productIds.size
      ? db.from('products').select('id, name, price, promotional_price').in('id', Array.from(productIds))
      : Promise.resolve({ data: [] }),
    sale.location_id
      ? fetchProductLocationPricesForLocation(db, sale.location_id)
      : Promise.resolve([]),
  ]);

  const productMap = buildProductPriceMap(products || []);
  const locationPriceMap = buildLocationPriceMap(locationPriceRows || [], productIds);
  const displayItems = reconcileSaleItemUnits(items || [], {
    saleTotal: sale.total_amount,
    saleDiscount: sale.discount,
    productMap,
    locationPriceMap,
  });

  const fin = computeSaleFinancials({ sale, items: displayItems, payments: payments || [] });
  const statement = {
    sales: [{
      sale_id: sale.id,
      id: sale.id,
      sale_date: sale.sale_date || sale.created_at,
      currency: sale.currency,
      total_due: fin.total_due,
      paid_amount: fin.paid_amount,
      outstanding_amount: fin.outstanding_amount,
      subtotal_before_discount: fin.subtotal_before_discount,
      discount_amount: fin.discount_amount,
    }],
    items: displayItems.map((item) => ({
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

  return {
    sale,
    customer: customer || {},
    statement,
    pdfLayby: {
      id: null,
      sale_id: sale.id,
      customer_id: sale.customer_id,
      customerInfo: customer || {},
      currency: sale.currency,
    },
  };
}

export async function downloadPosSalePdf({ saleId } = {}) {
  if (saleId == null || String(saleId).trim() === '') return { ok: false, error: 'Missing saleId' };
  try {
    const data = await loadPosSaleReceiptData(saleId);
    if (!data) return { ok: false, error: 'Sale not found' };

    const result = await generateLaybyPdf(data.pdfLayby, {
      mode: 'download',
      statement: data.statement,
      posReceipt: true,
    });
    return result ? { ok: true } : { ok: false, error: 'PDF generation failed' };
  } catch (e) {
    console.warn('POS sale PDF download failed:', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function buildPosSalePdfUrlForWhatsApp({ saleId } = {}) {
  if (saleId == null || String(saleId).trim() === '') return null;
  try {
    const data = await loadPosSaleReceiptData(saleId);
    if (!data) return null;

    const blob = await generateLaybyPdf(data.pdfLayby, {
      mode: 'blob',
      statement: data.statement,
      posReceipt: true,
    });
    if (!blob) return null;

    const customerName = data.customer?.name || 'Customer';
    const filePath = `sales/${data.sale.id}.pdf`;
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
