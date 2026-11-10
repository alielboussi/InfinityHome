import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import db from '../dataClient';
import { pickQuoteItemProductionFields } from './quoteProductionItemFields';
import { rewriteLegacyStorageUrl } from './storageImageUrl';
import { formatZambiaDate, formatZambiaTime } from './zambiaDateTime';
import { translateQuoteStringsToArabic } from '../services/quoteProductionApi';
import {
  ARABIC_TERMS,
  factoryOrderDepartmentArabic,
  toArabicIndicDigits,
  translateTermToArabic,
  translateQtyUnitLabel,
} from './quoteArabicTranslate';

export { ARABIC_TERMS, translateTermToArabic };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanDescriptionText(val) {
  let s = String(val ?? '').trim();
  if (!s) return '';
  s = s.replace(/^[-•\s]+/, '').trim();
  s = s.replace(/^description\s*:\s*/i, '').trim();
  s = s.replace(/^["“]+|["”]+$/g, '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the WhatsApp text message for the "Factory New" group (`120363201559496504@g.us`):
 *
 * Department : قسم التنجيد / قسم النجارة (Arabic only on this line)
 * Customer Name: ...
 * Customer Phone Number: ...
 * Quote Date: DD/MM/YYYY
 * Quote Time: HH:MM (CAT, UTC+02:00)
 */
export function buildFactoryOrderWhatsAppMessage({
  route,
  customerName,
  customerPhone,
  createdAt,
} = {}) {
  const deptAr = factoryOrderDepartmentArabic(route);
  const cName = String(customerName || '').trim() || '—';
  const cPhone = String(customerPhone || '').trim() || '—';
  const stamp = createdAt || new Date().toISOString();
  const quoteDate = formatZambiaDate(stamp);
  const quoteTime = `${formatZambiaTime(stamp)} Central Africa Time (CAT), UTC+02:00`;

  return [
    `Department : ${deptAr}`,
    `Customer Name: ${cName}`,
    `Customer Phone Number: ${cPhone}`,
    `Quote Date: ${quoteDate}`,
    `Quote Time: ${quoteTime}`,
  ].join('\n');
}

async function getCompanySettings() {
  try {
    if (typeof window !== 'undefined' && window.companySettings) {
      return window.companySettings;
    }
  } catch {}
  try {
    const { data } = await db.from('company_settings').select('*').single();
    if (typeof window !== 'undefined' && data) window.companySettings = data;
    return data || {};
  } catch {
    return {};
  }
}

function getLogoUrl(company) {
  const url = rewriteLegacyStorageUrl(company?.company_logo || company?.logo || '', {
    bucket: 'companylogos',
  });
  if (url) return url;
  try {
    if (typeof window !== 'undefined') return `${window.location.origin}/bestrest-logo.png`;
  } catch {}
  return '';
}

function buildBilingualDimensionsLines(fields) {
  const cleanDim = (v) => String(v).replace(/\s*cm$/i, '').trim();
  const enParts = [];
  const arParts = [];
  if (fields.dim_l_cm) {
    const v = cleanDim(fields.dim_l_cm);
    enParts.push(`${v}cm Length`);
    arParts.push(`الطول ${toArabicIndicDigits(v)} سم`);
  }
  if (fields.dim_w_cm) {
    const v = cleanDim(fields.dim_w_cm);
    enParts.push(`${v}cm Width`);
    arParts.push(`العرض ${toArabicIndicDigits(v)} سم`);
  }
  if (fields.dim_h_cm) {
    const v = cleanDim(fields.dim_h_cm);
    enParts.push(`${v}cm Height`);
    arParts.push(`الارتفاع ${toArabicIndicDigits(v)} سم`);
  }
  if (!enParts.length) return null;
  return {
    en: `-${enParts.join(' * ')}`,
    ar: `-${arParts.join(' × ')}`,
  };
}

/** A4 at 96dpi — html2canvas needs pixel width, not mm, or the capture clips the right edge. */
const FACTORY_ORDER_A4_WIDTH_PX = 794;
const FACTORY_ORDER_A4_HEIGHT_PX = 1123;

/**
 * Generate a Factory Order A4 PDF with NO prices (only Product and Qty columns),
 * header "Order / طلب إنتاج", centered column headers, and right-aligned Arabic-only product rows.
 */
export async function generateFactoryOrderBilingualPdf(quote = {}, items = [], { route = '' } = {}) {
  const company = await getCompanySettings();
  const logoUrl = getLogoUrl(company);

  const phrasesToTranslate = [];
  for (const it of items || []) {
    const name = String(it.name_override || it.name || it.product_name || it.quote_product_name || '').trim();
    if (name) phrasesToTranslate.push(name);
    const desc = cleanDescriptionText(it.description);
    if (desc) phrasesToTranslate.push(desc);
    const fields = pickQuoteItemProductionFields(it);
    if (fields.wood) phrasesToTranslate.push(fields.wood);
    for (const acc of fields.accessories || []) {
      phrasesToTranslate.push(acc);
    }
  }

  const serverTranslations = await translateQuoteStringsToArabic(phrasesToTranslate);

  const deptLabel = String(route || '').trim().toLowerCase() === 'carpentry'
    ? 'Carpentry / قسم النجارة'
    : 'Upholstery / قسم التنجيد';
  const custName = String(quote?.customer_name || quote?.name || '—').trim();
  const custPhone = String(quote?.customer_phone || quote?.phone || '—').trim();
  const quoteNumber = String(quote?.quote_number || quote?.id || '—').trim();
  const stamp = quote?.created_at || new Date().toISOString();
  const quoteDate = formatZambiaDate(stamp);
  const quoteTime = `${formatZambiaTime(stamp)} CAT (UTC+02:00)`;

  const rowsHtml = (items || [])
    .map((it) => {
      const rawName = String(
        it.name_override || it.name || it.product_name || it.quote_product_name || it.description || '-',
      ).trim();
      const nameEn = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const nameAr = translateTermToArabic(nameEn, serverTranslations);

      const fields = pickQuoteItemProductionFields(it);
      const specBlocks = [];

      if (fields.wood) {
        const woodAr = translateTermToArabic(fields.wood, serverTranslations);
        specBlocks.push(`
          <div class="bilingual-row">
            <div class="en-col" dir="ltr">-${escapeHtml(fields.wood)}</div>
            <div class="ar-col" dir="rtl">-${escapeHtml(woodAr)}</div>
          </div>
        `);
      }

      const dimLines = buildBilingualDimensionsLines(fields);
      if (dimLines) {
        specBlocks.push(`
          <div class="bilingual-row">
            <div class="en-col" dir="ltr">${escapeHtml(dimLines.en)}</div>
            <div class="ar-col" dir="rtl">${escapeHtml(dimLines.ar)}</div>
          </div>
        `);
      }

      if (fields.color_code) {
        specBlocks.push(`
          <div class="bilingual-row">
            <div class="en-col" dir="ltr">-Color Code: ${escapeHtml(fields.color_code)}</div>
            <div class="ar-col" dir="rtl">-رمز اللون: ${escapeHtml(fields.color_code)}</div>
          </div>
        `);
      }

      if (fields.leather_code) {
        specBlocks.push(`
          <div class="bilingual-row">
            <div class="en-col" dir="ltr">-Leather Code: ${escapeHtml(fields.leather_code)}</div>
            <div class="ar-col" dir="rtl">-رمز الجلد: ${escapeHtml(fields.leather_code)}</div>
          </div>
        `);
      }

      if (fields.foam_type) {
        const foamAr = translateTermToArabic(fields.foam_type, serverTranslations);
        specBlocks.push(`
          <div class="bilingual-row">
            <div class="en-col" dir="ltr">-Foam Type: ${escapeHtml(fields.foam_type)}</div>
            <div class="ar-col" dir="rtl">-نوع الفوم: ${escapeHtml(foamAr)}</div>
          </div>
        `);
      }

      const desc = cleanDescriptionText(it.description);
      if (desc) {
        const descAr = translateTermToArabic(desc, serverTranslations);
        specBlocks.push(`
          <div class="bilingual-row desc-pair">
            <div class="en-col" dir="ltr">Description: "${escapeHtml(desc)}"</div>
            <div class="ar-col" dir="rtl">الوصف: "${escapeHtml(descAr)}"</div>
          </div>
        `);
      }

      if (fields.accessories?.length) {
        const accEn = fields.accessories.join(', ');
        const accAr = fields.accessories
          .map((a) => translateTermToArabic(a, serverTranslations))
          .join(' ، ');
        specBlocks.push(`
          <div class="bilingual-row acc-pair">
            <div class="en-col" dir="ltr">Included Accessories : ${escapeHtml(accEn)}</div>
            <div class="ar-col" dir="rtl">الإكسسوارات المرفقة : ${escapeHtml(accAr)}</div>
          </div>
        `);
      }

      const qty = String(it.quantity ?? 1).trim();
      const unitAbbr = String(it.unit_abbr || it.abbreviation || it.unit_label || '').trim();
      const unitAr = unitAbbr && unitAbbr !== '-' ? translateQtyUnitLabel(unitAbbr, 'ar', serverTranslations) : '';
      const qtyArDigits = toArabicIndicDigits(qty);
      const qtyText = unitAbbr && unitAbbr !== '-'
        ? `${qty} ${unitAbbr} / ${qtyArDigits} ${unitAr || unitAbbr}`
        : `${qty} / ${qtyArDigits}`;

      return `
        <tr>
          <td class="col-product">
            <div class="bilingual-row prod-title-row">
              <div class="prod-name-en" dir="ltr">${escapeHtml(nameEn)}</div>
              <div class="prod-name-ar" dir="rtl">${escapeHtml(nameAr)}</div>
            </div>
            ${specBlocks.join('')}
          </td>
          <td class="col-qty">${escapeHtml(qtyText)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    }
    .page {
      width: ${FACTORY_ORDER_A4_WIDTH_PX}px;
      max-width: ${FACTORY_ORDER_A4_WIDTH_PX}px;
      padding: 38px 45px 30px;
      background: #ffffff;
      position: relative;
      display: block;
      overflow: visible;
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .page-footer {
      margin-top: 8px;
      padding-top: 5px;
      text-align: center;
      font-size: 11.5px;
      font-weight: 700;
      color: #334155;
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0d6efd;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .logo-box img {
      max-width: 82px;
      max-height: 68px;
      object-fit: contain;
    }
    .title-center {
      text-align: center;
      flex: 1;
    }
    .title-center h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
      font-size: 12px;
      line-height: 1.5;
    }
    table.order-table {
      width: 100%;
      max-width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-top: 4px;
    }
    table.order-table thead th {
      background: #0d6efd;
      color: #ffffff;
      font-size: 12.5px;
      font-weight: 700;
      padding: 7px 10px;
      border: 1px solid #0d6efd;
      text-align: center;
    }
    table.order-table thead th.col-product {
      width: 82%;
      text-align: center;
    }
    table.order-table thead th.col-qty {
      width: 18%;
      text-align: center;
    }
    table.order-table tbody td {
      border-bottom: 1px solid #cbd5e1;
      padding: 8px 10px;
      vertical-align: top;
      font-size: 11px;
    }
    td.col-product {
      direction: ltr;
    }
    td.col-qty {
      text-align: center;
      font-weight: 700;
      font-size: 12.5px;
      vertical-align: middle !important;
    }
    .bilingual-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      margin-top: 2px;
    }
    .prod-title-row {
      margin-top: 0;
      margin-bottom: 3px;
    }
    .prod-name-en {
      font-weight: 800;
      font-size: 12.5px;
      color: #0f172a;
      text-align: left;
      line-height: 1.3;
    }
    .prod-name-ar {
      font-weight: 800;
      font-size: 13px;
      color: #0f172a;
      text-align: right;
      line-height: 1.3;
    }
    .desc-pair, .acc-pair {
      margin-top: 4px;
    }
    .en-col {
      color: #1e293b;
      font-size: 10.8px;
      font-weight: 500;
      text-align: left;
      line-height: 1.32;
    }
    .ar-col {
      color: #0f172a;
      font-size: 11.2px;
      font-weight: 600;
      text-align: right;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="header-top">
      <div class="logo-box">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" crossorigin="anonymous" alt="" />` : ''}
      </div>
      <div class="title-center">
        <h1>Order / طلب إنتاج</h1>
      </div>
      <div style="width:90px"></div>
    </div>
    <div class="meta-row">
      <div class="meta-left">
        <div><strong>Department:</strong> ${escapeHtml(deptLabel)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(custName)}</div>
        <div><strong>Phone:</strong> ${escapeHtml(custPhone)}</div>
        <div><strong>Quote #:</strong> ${escapeHtml(quoteNumber)}</div>
        <div><strong>Quote Date:</strong> ${escapeHtml(quoteDate)}</div>
        <div><strong>Quote Time:</strong> ${escapeHtml(quoteTime)}</div>
      </div>
    </div>
    <table class="order-table">
      <thead>
        <tr>
          <th class="col-product">المنتج والمواصفات / Product &amp; Specifications</th>
          <th class="col-qty">الكمية / Qty</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </section>
</body>
</html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Factory order PDF');
  frame.style.position = 'fixed';
  frame.style.left = '-12000px';
  frame.style.top = '0';
  frame.style.width = `${FACTORY_ORDER_A4_WIDTH_PX}px`;
  frame.style.height = `${FACTORY_ORDER_A4_HEIGHT_PX}px`;
  frame.style.border = 'none';
  document.body.appendChild(frame);

  try {
    const doc = frame.contentWindow?.document;
    if (!doc) throw new Error('PDF frame unavailable');
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => {
      frame.onload = () => resolve();
      setTimeout(resolve, 600);
    });

    const imgs = [...doc.querySelectorAll('img')];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 1500);
          }),
      ),
    );

    // Paginate rows into discrete A4 pages so each page ends cleanly on its last row,
    // starts subsequent pages with a fresh table header, and displays "1 of X" footer inside the page.
    const MAX_PAGE_CONTENT_PX = 900;
    const firstPage = doc.querySelector('section.page');
    if (firstPage) {
      const headerEl = firstPage.querySelector('.header-top');
      const metaEl = firstPage.querySelector('.meta-row');
      const tableEl = firstPage.querySelector('table.order-table');
      const theadEl = tableEl?.querySelector('thead');
      const tbodyEl = tableEl?.querySelector('tbody');
      const rowNodes = tbodyEl ? [...tbodyEl.querySelectorAll('tr')] : [];

      if (tableEl && theadEl && tbodyEl && rowNodes.length > 0) {
        const headerH = (headerEl?.offsetHeight || 0) + (metaEl?.offsetHeight || 0) + 32;
        const theadH = (theadEl.offsetHeight || 38) + 10;
        const footerReservePx = 56;
        const rowHeights = rowNodes.map((tr) => Math.max(40, tr.offsetHeight || 60));

        const pagesRows = [];
        let currentRows = [];
        let usedPx = headerH + theadH + footerReservePx;

        rowNodes.forEach((tr, idx) => {
          const rh = rowHeights[idx];
          if (currentRows.length > 0 && usedPx + rh > MAX_PAGE_CONTENT_PX) {
            pagesRows.push(currentRows);
            currentRows = [tr];
            usedPx = theadH + footerReservePx + rh;
          } else {
            currentRows.push(tr);
            usedPx += rh;
          }
        });
        if (currentRows.length > 0) {
          pagesRows.push(currentRows);
        }

        const totalPages = pagesRows.length;
        const theadCloneHtml = theadEl.outerHTML;
        const headerCloneHtml = (headerEl?.outerHTML || '') + (metaEl?.outerHTML || '');

        doc.body.innerHTML = '';
        pagesRows.forEach((rowsForPage, pageIdx) => {
          const sec = doc.createElement('section');
          sec.className = 'page';
          sec.innerHTML = `
            ${pageIdx === 0 ? headerCloneHtml : ''}
            <table class="order-table">
              ${theadCloneHtml}
              <tbody></tbody>
            </table>
            <div class="page-footer">${pageIdx + 1} of ${totalPages}</div>
          `;
          const pageTbody = sec.querySelector('tbody');
          rowsForPage.forEach((tr) => pageTbody.appendChild(tr));
          doc.body.appendChild(sec);
        });
      }
    }

    const pageSections = [...doc.querySelectorAll('section.page')];
    const targets = pageSections.length ? pageSections : [doc.body];
    const pageWidthMm = 210;
    let pdf = null;

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const captureWidth = Math.max(
        FACTORY_ORDER_A4_WIDTH_PX,
        target.scrollWidth || 0,
        target.offsetWidth || 0,
      );
      const captureHeight = Math.max(
        target.scrollHeight || 0,
        target.offsetHeight || 0,
        120,
      );
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: Math.max(captureHeight, FACTORY_ORDER_A4_HEIGHT_PX),
        scrollX: 0,
        scrollY: 0,
      });
      const imgWidthMm = pageWidthMm;
      let contentHeightMm = Math.max(40, (canvas.height * imgWidthMm) / canvas.width);
      if (contentHeightMm > 297) {
        contentHeightMm = 297;
      }
      if (i === 0) {
        pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
        });
      } else {
        pdf.addPage('a4', 'p');
      }
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, contentHeightMm, undefined, 'FAST');
    }

    const blob = pdf.output('blob');
    const dataUri = pdf.output('datauristring');
    const base64 = String(dataUri || '').replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '');
    return { blob, base64 };
  } finally {
    try {
      document.body.removeChild(frame);
    } catch {
      // ignore
    }
  }
}
