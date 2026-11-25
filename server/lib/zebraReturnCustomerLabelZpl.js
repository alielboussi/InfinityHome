/** Zebra ZPL — return customer pickup label (80×68 mm). Code 128 + product-image QR. */

import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  COMPANY_NAME,
  BARCODE_HEIGHT_MM,
  BARCODE_WIDTH_MM,
  BORDER_TOP_INSET_MM,
  BLOCK_GAP_MM,
  COMPANY_TEXT_HEIGHT_MM,
  GAP_AFTER_BARCODE_MM,
  GAP_AFTER_COMPANY_MM,
  HEADER_CLEARANCE_MM,
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
  NAME_LINE_HEIGHT_MM,
  QR_SIZE_MM,
  ROW_TEXT_MM,
  computeProductionLabelLayout,
  labelPitchMm,
  mmToDots,
  zebraCode128ModuleDots,
  zebraQrMagnification,
  zebraQrPrintedMm,
} from './warehouseProductionLabelLayout.js';
import {
  formatProductionLabelBlockDate,
  formatProductionLabelBlockTime,
} from './warehouseProductionLabelCatTime.js';

const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Product Name:',
  customerName: 'Customer Name:',
  customerPhone: 'Customer #:',
  date: 'Date:',
  time: 'Time:',
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

function computeReturnCustomerLabelDots({ dpi = 203, qrDataLength = 110 } = {}) {
  const base = computeProductionLabelLayout({ dpi });
  const toDots = (mm) => mmToDots(mm, dpi);
  const textTopDots = (rowStartMm, padMm = 0.35) => toDots(rowStartMm + padMm);
  const rowGap = Math.max(BLOCK_GAP_MM, HEADER_CLEARANCE_MM);

  const marginMm = LABEL_MARGIN_MM;
  const companyTextTopMm = marginMm + BORDER_TOP_INSET_MM;
  const barcodeTopMm = companyTextTopMm + COMPANY_TEXT_HEIGHT_MM + GAP_AFTER_COMPANY_MM;
  let y = barcodeTopMm + BARCODE_HEIGHT_MM + GAP_AFTER_BARCODE_MM;

  const skuRowMm = y;
  y += ROW_TEXT_MM + rowGap;

  const nameBlockTopMm = y;
  const nameBlockHeightMm = NAME_LINE_HEIGHT_MM;
  y = nameBlockTopMm + nameBlockHeightMm + rowGap;

  const qrPrintedMm = zebraQrPrintedMm(QR_SIZE_MM, qrDataLength, dpi);
  const qrBlockYMm = y;
  const imageQrLeftMm = LABEL_WIDTH_MM / 2 - qrPrintedMm / 2;
  y += qrPrintedMm + rowGap;

  const customerNameRowMm = y;
  y += ROW_TEXT_MM + rowGap;

  const customerPhoneRowMm = y;
  y += ROW_TEXT_MM + rowGap;

  const dateRowMm = y;
  y += ROW_TEXT_MM + rowGap;

  const timeRowMm = y;

  const d = base.dots;
  const valueX = toDots(29);
  const valueBoxW = toDots(LABEL_WIDTH_MM - 29 - LABEL_MARGIN_MM - 1);
  return {
    ...d,
    valueX,
    valueBoxW,
    skuRowY: textTopDots(skuRowMm),
    nameBlockTop: textTopDots(nameBlockTopMm),
    qrBlockY: toDots(qrBlockYMm),
    imageQrX: toDots(imageQrLeftMm),
    qrSize: toDots(QR_SIZE_MM),
    customerNameRowY: textTopDots(customerNameRowMm),
    customerPhoneRowY: textTopDots(customerPhoneRowMm),
    dateRowY: textTopDots(dateRowMm),
    timeRowY: textTopDots(timeRowMm),
  };
}

export function buildWarehouseReturnCustomerLabelZpl(opts = {}) {
  const widthMm = Number(process.env.ZEBRA_LABEL_WIDTH_MM || LABEL_WIDTH_MM);
  const heightMm = Number(process.env.ZEBRA_LABEL_HEIGHT_MM || LABEL_HEIGHT_MM);
  const gapMm = Number(process.env.ZEBRA_LABEL_GAP_MM || LABEL_GAP_MM);
  const marginMm = Number(process.env.ZEBRA_LABEL_SIDE_MARGIN_MM || LABEL_MARGIN_MM);
  const dpi = Number(process.env.ZEBRA_PRINTER_DPI || 203);
  const pitchMm = labelPitchMm(heightMm, gapMm);
  const copies = Math.max(1, Math.floor(Number(opts.copies) || 1));

  const printedAt = opts.printedAt ? new Date(opts.printedAt) : new Date();
  if (Number.isNaN(printedAt.getTime())) {
    throw new Error('Invalid printedAt');
  }

  const photoQrUrl = String(opts.imageQrUrl || '').trim()
    || buildProductPhotoQrUrl(String(opts.sku || '').trim());
  const imageQr = qrEscape(photoQrUrl);
  const widthDots = mmToDots(widthMm, dpi);
  const d = computeReturnCustomerLabelDots({ dpi, qrDataLength: imageQr.length || 110 });
  const mainX = d.margin;
  const mainW = d.mainWidth;
  const hf = d.headerFont;
  const vf = d.valueFont;
  const cf = d.companyFont;

  const skuText = zplEscape(opts.sku).toUpperCase();
  const nameText = zplEscape(opts.name);
  const customerName = zplEscape(opts.customerName);
  const customerPhone = zplEscape(opts.customerPhone);
  const dateText = zplEscape(formatProductionLabelBlockDate(printedAt));
  const timeText = zplEscape(formatProductionLabelBlockTime(printedAt));
  const companyLine = zplEscape(COMPANY_NAME);

  const labelField = (y, text) => (
    `^FO${d.labelX},${y}^A0N,${hf},${hf}^FD${text}^FS`
  );
  const valueField = (y, text, maxLines = 1) => (
    `^FO${d.valueX},${y}^A0N,${vf},${vf}^FB${d.valueBoxW},${maxLines},0,C,0^FD${text}^FS`
  );

  const barcodeH = d.barcodeHeight;
  const barcodeModule = zebraCode128ModuleDots(skuText, d.barcodeWidth);
  const imageMag = zebraQrMagnification(d.qrSize, imageQr.length);

  const lines = [
    '^XA',
    '^CI28',
    `^PW${widthDots}`,
    `^LL${mmToDots(pitchMm, dpi)}`,
    '^LH0,0',
    `^FO${mainX},${d.margin}^GB${d.boxW},${d.boxH},2^FS`,
    `^FO${mainX},${d.companyTextTop}^A0N,${cf},${cf}^FB${mainW},1,0,C,0^FD${companyLine}^FS`,
    `^FO${d.barcodeLeft},${d.barcodeTop}^BY${barcodeModule},3,${barcodeH}^BCN,${barcodeH},N,N,N^FD${skuText}^FS`,
    labelField(d.skuRowY, FIELD_LABELS.sku),
    valueField(d.skuRowY, skuText),
    labelField(d.nameBlockTop, FIELD_LABELS.name),
    `^FO${d.valueX},${d.nameBlockTop}^A0N,${vf},${vf}^FB${d.valueBoxW},1,${Math.max(1, Math.floor(d.valueFont * 0.9))},C,0^FD${nameText}^FS`,
    `^FO${d.imageQrX},${d.qrBlockY}^BQN,2,${imageMag}^FDMA,${imageQr}^FS`,
    labelField(d.customerNameRowY, FIELD_LABELS.customerName),
    valueField(d.customerNameRowY, customerName),
    labelField(d.customerPhoneRowY, FIELD_LABELS.customerPhone),
    valueField(d.customerPhoneRowY, customerPhone),
    labelField(d.dateRowY, FIELD_LABELS.date),
    valueField(d.dateRowY, dateText),
    labelField(d.timeRowY, FIELD_LABELS.time),
    valueField(d.timeRowY, timeText),
    `^PQ${copies}`,
    '^XZ',
  ];

  return `${lines.join('\n')}\n`;
}

export { COMPANY_NAME, FIELD_LABELS };
