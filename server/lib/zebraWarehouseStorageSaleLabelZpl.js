/** Zebra ZPL — POS / Sales Storage label (80×68 mm). Values + photo QR center-aligned on one vertical axis; headers left. */

import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  COMPANY_NAME,
  BARCODE_WIDTH_MM,
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
  zebraQrPrintedMm,
} from './warehouseProductionLabelLayout.js';
import { formatProductionLabelBlockDate } from './warehouseProductionLabelCatTime.js';

const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Name:',
  customerName: 'Customer:',
  customerPhone: 'Customer #:',
  saleDate: 'Sale Date:',
  receipt: 'Receipt #:',
  setName: 'Set:',
};

/** Values/QR sit right of this — keeps left headers from overlapping centered values. */
const STORAGE_VALUE_COL_LEFT_MM = 29;
const STORAGE_LABEL_QR_SIZE_MM = 6.3;
const STORAGE_LABEL_QR_SIZE_COMPACT_MM = 5.25;
const STORAGE_ROW_GAP_MM = 2;
const STORAGE_QR_BEFORE_GAP_MM = 2;
const STORAGE_QR_AFTER_GAP_MM = 3;
/** Inset values/QR from the inner right border (0 = inner right edge). */
const STORAGE_VALUE_RIGHT_INSET_MM = 0;

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

function parseSaleDateInput(raw) {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  const s = String(raw).trim();
  const dmyMatch = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  if (dmyMatch) {
    const dd = String(dmyMatch[1]).padStart(2, '0');
    const mm = String(dmyMatch[2]).padStart(2, '0');
    const yyyy = dmyMatch[3];
    return new Date(`${yyyy}-${mm}-${dd}T12:00:00+02:00`);
  }
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    return new Date(`${s}T12:00:00+02:00`);
  }
  return new Date(s);
}

export function computeStorageSaleLabelLayoutMm({
  includeSetRow = false,
  includeReceiptRow = false,
  qrDataLength = 96,
  dpi = 203,
} = {}) {
  const compact = includeSetRow || includeReceiptRow;
  const marginMm = LABEL_MARGIN_MM;
  const mainWidthMm = LABEL_WIDTH_MM - marginMm * 2;
  const valueRightMm = LABEL_WIDTH_MM - marginMm - STORAGE_VALUE_RIGHT_INSET_MM;
  const valueBoxLeftMm = STORAGE_VALUE_COL_LEFT_MM;
  const valueBoxWidthMm = valueRightMm - valueBoxLeftMm;
  const valueCenterXMm = valueBoxLeftMm + valueBoxWidthMm / 2;
  const rowTextMm = compact ? 3.35 : ROW_TEXT_MM;
  const rowGapMm = compact ? 1.5 : STORAGE_ROW_GAP_MM;
  const qrTargetMm = compact ? STORAGE_LABEL_QR_SIZE_COMPACT_MM : STORAGE_LABEL_QR_SIZE_MM;
  const qrPrintedHeightMm = zebraQrPrintedMm(qrTargetMm, qrDataLength, dpi);
  const nameBlockHeightMm = compact
    ? rowTextMm * 1.5
    : NAME_LINE_HEIGHT_MM * NAME_VALUE_MAX_LINES;
  const qrBeforeGap = compact ? 1.5 : STORAGE_QR_BEFORE_GAP_MM;
  const qrAfterGap = compact ? 1.5 : STORAGE_QR_AFTER_GAP_MM;

  const companyTextTopMm = marginMm + BORDER_TOP_INSET_MM;
  const barcodeTopMm = companyTextTopMm + COMPANY_TEXT_HEIGHT_MM + GAP_AFTER_COMPANY_MM;
  let y = barcodeTopMm + BARCODE_HEIGHT_MM + GAP_AFTER_BARCODE_MM;

  const skuRowMm = y;
  y += rowTextMm + rowGapMm;
  const nameBlockTopMm = y;
  y = nameBlockTopMm + nameBlockHeightMm + qrBeforeGap;
  const qrBlockYMm = y;
  const imageQrLeftMm = valueCenterXMm - qrPrintedHeightMm / 2;
  y += qrPrintedHeightMm + qrAfterGap;

  const customerNameRowMm = y;
  y += rowTextMm + rowGapMm;
  const customerPhoneRowMm = y;
  y += rowTextMm + rowGapMm;
  const saleDateRowMm = y;
  y += rowTextMm + rowGapMm;
  const receiptRowMm = includeReceiptRow ? y : null;
  if (includeReceiptRow) y += rowTextMm + rowGapMm;
  const setRowMm = includeSetRow ? y : null;

  return {
    marginMm,
    mainWidthMm,
    valueBoxLeftMm,
    valueBoxWidthMm,
    valueRightMm,
    valueCenterXMm,
    barcodeLeftMm: (LABEL_WIDTH_MM - BARCODE_WIDTH_MM) / 2,
    barcodeTopMm,
    companyTextTopMm,
    skuRowMm,
    nameBlockTopMm,
    qrBlockYMm,
    imageQrLeftMm,
    qrTargetMm,
    qrPrintedHeightMm,
    customerNameRowMm,
    customerPhoneRowMm,
    saleDateRowMm,
    receiptRowMm,
    setRowMm,
    rowTextMm,
    rowGapMm,
    compact,
  };
}

function computeStorageSaleLabelDots({
  dpi = 203,
  includeSetRow = false,
  includeReceiptRow = false,
  qrDataLength = 96,
} = {}) {
  const base = computeProductionLabelLayout({ dpi });
  const toDots = (mm) => mmToDots(mm, dpi);
  const textTopDots = (rowStartMm, padMm = 0.25) => toDots(rowStartMm + padMm);
  const layout = computeStorageSaleLabelLayoutMm({
    includeSetRow,
    includeReceiptRow,
    qrDataLength,
    dpi,
  });
  const d = base.dots;
  const rowFont = layout.compact ? Math.max(24, d.headerFont - 3) : d.headerFont;
  return {
    ...d,
    headerFont: rowFont,
    valueFont: rowFont,
    valueX: toDots(layout.valueBoxLeftMm),
    valueBoxW: toDots(layout.valueBoxWidthMm),
    skuRowY: textTopDots(layout.skuRowMm),
    nameBlockTop: textTopDots(layout.nameBlockTopMm),
    qrBlockY: toDots(layout.qrBlockYMm),
    imageQrX: toDots(layout.imageQrLeftMm),
    qrSize: toDots(layout.qrTargetMm),
    qrPrintedSize: toDots(layout.qrPrintedHeightMm),
    customerNameRowY: textTopDots(layout.customerNameRowMm),
    customerPhoneRowY: textTopDots(layout.customerPhoneRowMm),
    saleDateRowY: textTopDots(layout.saleDateRowMm),
    receiptRowY: layout.receiptRowMm != null ? textTopDots(layout.receiptRowMm) : null,
    setRowY: layout.setRowMm != null ? textTopDots(layout.setRowMm) : null,
  };
}

export function buildWarehouseStorageSaleLabelZpl(opts = {}) {
  const widthMm = Number(process.env.ZEBRA_LABEL_WIDTH_MM || LABEL_WIDTH_MM);
  const heightMm = Number(process.env.ZEBRA_LABEL_HEIGHT_MM || LABEL_HEIGHT_MM);
  const gapMm = Number(process.env.ZEBRA_LABEL_GAP_MM || LABEL_GAP_MM);
  const dpi = Number(process.env.ZEBRA_PRINTER_DPI || 203);
  const pitchMm = labelPitchMm(heightMm, gapMm);
  const copies = Math.max(1, Math.floor(Number(opts.copies) || 1));

  const saleAt = parseSaleDateInput(opts.saleDate);
  if (Number.isNaN(saleAt.getTime())) throw new Error('Invalid saleDate');

  const setNameText = zplEscape(opts.setName || opts.set_name || '');
  const includeSetRow = Boolean(setNameText);
  const receiptText = zplEscape(opts.receiptNumber || opts.receipt_number || '');
  const includeReceiptRow = Boolean(receiptText);

  const widthDots = mmToDots(widthMm, dpi);
  const photoQrUrl = String(opts.imageQrUrl || '').trim()
    || buildProductPhotoQrUrl(String(opts.sku || '').trim());
  const d = computeStorageSaleLabelDots({
    dpi,
    includeSetRow,
    includeReceiptRow,
    qrDataLength: photoQrUrl.length,
  });
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

  const imageQr = qrEscape(photoQrUrl);
  const imageMag = zebraQrMagnification(d.qrSize, imageQr.length);

  const labelField = (y, text) => (
    `^FO${d.labelX},${y}^A0N,${hf},${hf}^FD${text}^FS`
  );
  const valueField = (y, text, maxLines = 1) => (
    `^FO${d.valueX},${y}^A0N,${vf},${vf}^FB${d.valueBoxW},${maxLines},0,C,0^FD${text}^FS`
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
    `^FO${d.valueX},${d.nameBlockTop}^A0N,${vf},${vf}^FB${d.valueBoxW},${NAME_VALUE_MAX_LINES},${Math.max(1, Math.floor(d.valueFont * 0.9))},C,0^FD${nameText}^FS`,
    ...(imageQr
      ? [`^FO${d.imageQrX},${d.qrBlockY}^BQN,2,${imageMag}^FDLA,${imageQr}^FS`]
      : []),
    labelField(d.customerNameRowY, FIELD_LABELS.customerName),
    valueField(d.customerNameRowY, customerName),
    labelField(d.customerPhoneRowY, FIELD_LABELS.customerPhone),
    valueField(d.customerPhoneRowY, customerPhone),
    labelField(d.saleDateRowY, FIELD_LABELS.saleDate),
    valueField(d.saleDateRowY, saleDateText),
    ...(includeReceiptRow && d.receiptRowY != null
      ? [
        labelField(d.receiptRowY, FIELD_LABELS.receipt),
        valueField(d.receiptRowY, receiptText),
      ]
      : []),
    ...(includeSetRow && d.setRowY != null
      ? [
        labelField(d.setRowY, FIELD_LABELS.setName),
        `^FO${d.valueX},${d.setRowY}^A0N,${vf},${vf}^FB${d.valueBoxW},2,${Math.max(1, Math.floor(vf * 0.85))},C,0^FD${setNameText}^FS`,
      ]
      : []),
    `^PQ${copies}`,
    '^XZ',
  ];

  return `${lines.join('\n')}\n`;
}

export { FIELD_LABELS, parseSaleDateInput };
