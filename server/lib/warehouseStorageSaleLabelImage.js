/**
 * Raster preview — same layout as zebraWarehouseStorageSaleLabelZpl.js (80×68 mm).
 */
import { Resvg } from '@resvg/resvg-js';
import bwipjs from 'bwip-js';
import path from 'path';
import sharp from 'sharp';
import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  BARCODE_HEIGHT_MM,
  BARCODE_WIDTH_MM,
  COMPANY_NAME,
  COMPANY_TEXT_HEIGHT_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
  NAME_LINE_HEIGHT_MM,
  NAME_VALUE_MAX_LINES,
  ROW_TEXT_MM,
  rowTextBaselineMm,
} from './warehouseProductionLabelLayout.js';
import { formatProductionLabelBlockDate } from './warehouseProductionLabelCatTime.js';
import {
  computeStorageSaleLabelLayoutMm,
  FIELD_LABELS,
  parseSaleDateInput,
} from './zebraWarehouseStorageSaleLabelZpl.js';

const PX_PER_MM = 10;
const W = Math.round(LABEL_WIDTH_MM * PX_PER_MM);
const H = Math.round(LABEL_HEIGHT_MM * PX_PER_MM);
const BORDER = '#1e3a5f';
const LABEL_COL_MM = 3;
const ROW_FONT_PX = 11;
const COMPANY_FONT_PX = 11;

export const STORAGE_SALE_LABEL_SAMPLE = {
  name: 'Kenya L-Shaped Sofa',
  sku: 'KENYA-4421',
  customerName: 'Mary Mwamba',
  customerPhone: '+260 97 123 4567',
  receiptNumber: 'KIT-2025-0842',
  saleDate: new Date(),
};

function mmToPx(mm) {
  return Math.round(mm * PX_PER_MM);
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function makeCode128Png(sku) {
  const targetW = Math.round(BARCODE_WIDTH_MM * PX_PER_MM);
  const targetH = Math.round(BARCODE_HEIGHT_MM * PX_PER_MM);
  const raw = await bwipjs.toBuffer({
    bcid: 'code128',
    text: String(sku || '').toUpperCase(),
    scale: 3,
    height: 12,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
  return sharp(raw)
    .resize(targetW, targetH, { fit: 'fill' })
    .png()
    .toBuffer();
}

async function makeQrPng(text, sizePx) {
  const qr = await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: String(text || '').trim(),
    scale: 4,
    paddingwidth: 0,
    paddingheight: 0,
  });
  return sharp(qr)
    .resize(sizePx, sizePx, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

function dejavuSansFontPath() {
  return path.join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
}

function rasterizeLabelSvg(textSvg) {
  const resvg = new Resvg(textSvg, {
    fitTo: { mode: 'width', value: W },
    font: {
      fontFiles: [dejavuSansFontPath()],
      loadSystemFonts: false,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

function storageRowSvg({
  labelXpx,
  valueCenterXpx,
  rowYpx,
  label,
  value,
}) {
  return `
  <text x="${labelXpx}" y="${rowYpx}" text-anchor="start" font-family="DejaVu Sans, sans-serif" font-size="${ROW_FONT_PX}" font-weight="700" fill="#111">${escapeXml(label)}</text>
  <text x="${valueCenterXpx}" y="${rowYpx}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${ROW_FONT_PX}" font-weight="600" fill="#000">${escapeXml(value)}</text>
  `;
}

export function buildStorageSaleLabelFields(opts = {}) {
  const saleAt = parseSaleDateInput(opts.saleDate);
  const sku = String(opts.sku || '').trim().toUpperCase();
  const name = String(opts.name || '').trim();
  const customerName = String(opts.customerName || '').trim() || '—';
  const customerPhone = String(opts.customerPhone || '').trim() || '—';
  const receiptNumber = String(opts.receiptNumber || opts.receipt_number || '').trim();
  const setName = String(opts.setName || opts.set_name || '').trim();
  return {
    sku,
    name,
    customerName,
    customerPhone,
    receiptNumber,
    setName,
    saleDateText: formatProductionLabelBlockDate(saleAt),
    imageQrUrl: buildProductPhotoQrUrl(sku),
  };
}

export async function buildWarehouseStorageSaleLabelPngBuffer(opts = {}) {
  const meta = buildStorageSaleLabelFields(opts);
  const includeSetRow = Boolean(meta.setName);
  const includeReceiptRow = Boolean(meta.receiptNumber);
  const qrDataLength = buildProductPhotoQrUrl(meta.sku).length;
  const layout = computeStorageSaleLabelLayoutMm({
    includeSetRow,
    includeReceiptRow,
    qrDataLength,
  });

  const marginPx = mmToPx(layout.marginMm);
  const mainWidthPx = mmToPx(layout.mainWidthMm);
  const centerXPx = mmToPx(LABEL_WIDTH_MM / 2);
  const labelXpx = mmToPx(LABEL_COL_MM);
  const valueCenterXpx = mmToPx(layout.valueCenterXMm);

  const textBaseline = (rowMm, rowHeightMm) => mmToPx(rowTextBaselineMm(rowMm, rowHeightMm));
  const companyY = textBaseline(layout.companyTextTopMm, COMPANY_TEXT_HEIGHT_MM);
  const barcodeTop = mmToPx(layout.barcodeTopMm);
  const barcodeLeft = mmToPx(layout.barcodeLeftMm);

  const barcodeResized = await makeCode128Png(meta.sku);
  const qrSizePx = mmToPx(layout.qrPrintedHeightMm);
  const imageQrPng = await makeQrPng(meta.imageQrUrl, qrSizePx);
  const imageQrLeft = mmToPx(layout.imageQrLeftMm);
  const qrTop = mmToPx(layout.qrBlockYMm);

  const textSvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="${marginPx}" y="${marginPx}" width="${mainWidthPx}" height="${H - marginPx * 2}" fill="none" stroke="${BORDER}" stroke-width="3"/>
  <text x="${centerXPx}" y="${companyY}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="${COMPANY_FONT_PX}" font-weight="700" fill="#1e3a5f">${escapeXml(COMPANY_NAME)}</text>
  ${storageRowSvg({
    labelXpx,
    valueCenterXpx,
    rowYpx: textBaseline(layout.skuRowMm, layout.rowTextMm),
    label: FIELD_LABELS.sku,
    value: meta.sku,
  })}
  ${storageRowSvg({
    labelXpx,
    valueCenterXpx,
    rowYpx: textBaseline(layout.nameBlockTopMm, layout.rowTextMm),
    label: FIELD_LABELS.name,
    value: meta.name,
  })}
  ${storageRowSvg({
    labelXpx,
    valueCenterXpx,
    rowYpx: textBaseline(layout.customerNameRowMm, layout.rowTextMm),
    label: FIELD_LABELS.customerName,
    value: meta.customerName,
  })}
  ${storageRowSvg({
    labelXpx,
    valueCenterXpx,
    rowYpx: textBaseline(layout.customerPhoneRowMm, layout.rowTextMm),
    label: FIELD_LABELS.customerPhone,
    value: meta.customerPhone,
  })}
  ${storageRowSvg({
    labelXpx,
    valueCenterXpx,
    rowYpx: textBaseline(layout.saleDateRowMm, layout.rowTextMm),
    label: FIELD_LABELS.saleDate,
    value: meta.saleDateText,
  })}
  ${includeReceiptRow && layout.receiptRowMm != null
    ? storageRowSvg({
      labelXpx,
      valueCenterXpx,
      rowYpx: textBaseline(layout.receiptRowMm, layout.rowTextMm),
      label: FIELD_LABELS.receipt,
      value: meta.receiptNumber,
    })
    : ''}
  ${includeSetRow && layout.setRowMm != null
    ? storageRowSvg({
      labelXpx,
      valueCenterXpx,
      rowYpx: textBaseline(layout.setRowMm, layout.rowTextMm),
      label: FIELD_LABELS.setName,
      value: meta.setName,
    })
    : ''}
</svg>`;

  const base = rasterizeLabelSvg(textSvg);
  return sharp(base)
    .composite([
      { input: barcodeResized, left: barcodeLeft, top: barcodeTop },
      { input: imageQrPng, left: imageQrLeft, top: qrTop },
    ])
    .png()
    .toBuffer();
}

export async function buildWarehouseStorageSaleLabelPngBase64(opts) {
  const buf = await buildWarehouseStorageSaleLabelPngBuffer(opts);
  return buf.toString('base64');
}
