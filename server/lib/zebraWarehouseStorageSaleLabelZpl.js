/** Zebra ZPL — POS / Sales Storage label (80×68 mm: Code 128 SKU, Product Name, Image QR, Customer Name, Customer Phone, Sale Date). */

import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  COMPANY_NAME,
  BARCODE_HEIGHT_MM,
  BORDER_TOP_INSET_MM,
  BLOCK_GAP_MM,
  COMPANY_TEXT_HEIGHT_MM,
  GAP_AFTER_BARCODE_MM,
  GAP_AFTER_COMPANY_MM,
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
  NAME_LINE_HEIGHT_MM,
  NAME_VALUE_MAX_LINES,
  QR_SIZE_MM,
  ROW_TEXT_MM,
  computeProductionLabelLayout,
  labelPitchMm,
  mmToDots,
  zebraQrMagnification,
} from './warehouseProductionLabelLayout.js';
import { formatProductionLabelBlockDate } from './warehouseProductionLabelCatTime.js';

const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Product Name:',
  customerName: 'Customer Name:',
  customerPhone: 'Customer #:',
  saleDate: 'Sale Date:',
};

function zplEscape(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, ' ')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ');
}

function qrEscape(data) {
  return String(data || '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\^/g, '\\^');
}

function computeStorageSaleLabelDots({ dpi = 203 } = {}) {
  const base = computeProductionLabelLayout({ dpi });
  const toDots = (mm) => mmToDots(mm, dpi);
  const textTopDots = (rowStartMm, padMm = 0.35) => toDots(rowStartMm + padMm);
  const centerXMm = LABEL_WIDTH_MM / 2;

  const companyTextTopMm = LABEL_MARGIN_MM + BORDER_TOP_INSET_MM;
  const barcodeTopMm = companyTextTopMm + COMPANY_TEXT_HEIGHT_MM + GAP_AFTER_COMPANY_MM;
  let y = barcodeTopMm + BARCODE_HEIGHT_MM + GAP_AFTER_BARCODE_MM;

  const skuRowMm = y;
  y += ROW_TEXT_MM + BLOCK_GAP_MM;
  const nameBlockTopMm = y;
  y = nameBlockTopMm + NAME_LINE_HEIGHT_MM * NAME_VALUE_MAX_LINES + BLOCK_GAP_MM;

  const qrBlockYMm = y;
  const imageQrLeftMm = centerXMm - QR_SIZE_MM / 2;
  y += QR_SIZE_MM + BLOCK_GAP_MM + 0.4;

  const customerNameRowMm = y;
  y += ROW_TEXT_MM + BLOCK_GAP_MM;
  const customerPhoneRowMm = y;
  y += ROW_TEXT_MM + BLOCK_GAP_MM;
  const saleDateRowMm = y;

  const d = base.dots;
  return {
    ...d,
    skuRowY: textTopDots(skuRowMm),
    nameBlockTop: textTopDots(nameBlockTopMm),
    qrBlockY: toDots(qrBlockYMm),
    imageQrX: toDots(imageQrLeftMm),
    qrSize: toDots(QR_SIZE_MM),
    customerNameRowY: textTopDots(customerNameRowMm),
    customerPhoneRowY: textTopDots(customerPhoneRowMm),
    saleDateRowY: textTopDots(saleDateRowMm),
  };
}

export function buildWarehouseStorageSaleLabelZpl(opts = {}) {
  const widthMm = Number(process.env.ZEBRA_LABEL_WIDTH_MM || LABEL_WIDTH_MM);
  const heightMm = Number(process.env.ZEBRA_LABEL_HEIGHT_MM || LABEL_HEIGHT_MM);
  const gapMm = Number(process.env.ZEBRA_LABEL_GAP_MM || LABEL_GAP_MM);
  const dpi = Number(process.env.ZEBRA_PRINTER_DPI || 203);
  const pitchMm = labelPitchMm(heightMm, gapMm);
  const copies = Math.max(1, Math.floor(Number(opts.copies) || 1));

  const saleAt = opts.saleDate ? new Date(opts.saleDate) : new Date();
  if (Number.isNaN(saleAt.getTime())) throw new Error('Invalid saleDate');

  const widthDots = mmToDots(widthMm, dpi);
  const d = computeStorageSaleLabelDots({ dpi });
  const mainX = d.margin;
  const mainW = d.mainWidth;
  const hf = d.headerFont;
  const vf = d.valueFont;
  const cf = d.companyFont;

  const skuText = zplEscape(opts.sku).toUpperCase();
  const nameText = zplEscape(opts.name);
  const customerName = zplEscape(opts.customerName);
  const customerPhone = zplEscape(opts.customerPhone);
  const saleDateText = zplEscape(formatProductionLabelBlockDate(saleAt));
  const companyLine = zplEscape(COMPANY_NAME);

  const photoQrUrl = String(opts.imageQrUrl || '').trim()
    || buildProductPhotoQrUrl(String(opts.sku || '').trim());
  const imageQr = qrEscape(photoQrUrl);
  const imageMag = zebraQrMagnification(d.qrSize, imageQr.length);

  const labelField = (y, text) => (
    `^FO${d.labelX},${y}^A0N,${hf},${hf}^FD${text}^FS`
  );
  const valueField = (y, text, maxLines = 1) => (
    `^FO0,${y}^A0N,${vf},${vf}^FB${d.labelWidth},${maxLines},0,C,0^FD${text}^FS`
  );

  const barcodeH = d.barcodeHeight;
  const barcodeModule = Math.max(2, Math.min(3, Math.floor(d.barcodeWidth / (skuText.length * 11 + 35))));

  const lines = [
    '^XA',
    '^CI28',
    `^PW${widthDots}`,
    `^LL${mmToDots(pitchMm, dpi)}`,
    '^LH0,0',
    `^FO${mainX},${d.margin}^GB${d.boxW},${d.boxH},2^FS`,
    `^FO${mainX},${d.companyTextTop}^A0N,${cf},${cf}^FB${mainW},1,0,C,0^FD${companyLine}^FS`,
    `^FO${d.barcodeLeft},${d.barcodeTop}^BY${barcodeModule},3,${Math.max(5, Math.floor(barcodeH / 10))}^BCN,${barcodeH},N,N,N^FD${skuText}^FS`,
    labelField(d.skuRowY, FIELD_LABELS.sku),
    valueField(d.skuRowY, skuText),
    labelField(d.nameBlockTop, FIELD_LABELS.name),
    `^FO0,${d.nameBlockTop}^A0N,${vf},${vf}^FB${d.labelWidth},${NAME_VALUE_MAX_LINES},${Math.max(1, Math.floor(d.valueFont * 0.9))},C,0^FD${nameText}^FS`,
    ...(imageQr
      ? [`^FO${d.imageQrX},${d.qrBlockY}^BQN,2,${imageMag}^FDLA,${imageQr}^FS`]
      : []),
    labelField(d.customerNameRowY, FIELD_LABELS.customerName),
    valueField(d.customerNameRowY, customerName),
    labelField(d.customerPhoneRowY, FIELD_LABELS.customerPhone),
    valueField(d.customerPhoneRowY, customerPhone),
    labelField(d.saleDateRowY, FIELD_LABELS.saleDate),
    valueField(d.saleDateRowY, saleDateText),
    `^PQ${copies}`,
    '^XZ',
  ];

  return `${lines.join('\n')}\n`;
}

export { FIELD_LABELS };
