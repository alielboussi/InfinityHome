/** Zebra ZPL — warehouse production labels (80×68 mm). */

import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  COMPANY_NAME,
  computeProductionLabelLayout,
  FIELD_LABELS,
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
  NAME_VALUE_MAX_LINES,
  labelPitchMm,
  mmToDots,
  zebraQrMagnification,
} from './warehouseProductionLabelLayout.js';
import {
  formatProductionLabelBlockDate,
  formatProductionLabelBlockTime,
} from './warehouseProductionLabelCatTime.js';

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

export function buildWarehouseProductionLabelZpl(opts = {}) {
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

  const widthDots = mmToDots(widthMm, dpi);
  const layout = computeProductionLabelLayout({ heightMm, marginMm, dpi });
  const d = layout.dots;
  const mainX = d.margin;
  const mainW = d.mainWidth;
  const hf = d.headerFont;
  const vf = d.valueFont;
  const cf = d.companyFont;

  const skuText = zplEscape(opts.sku).toUpperCase();
  const nameRaw = String(opts.name || '').trim();
  const nameText = zplEscape(nameRaw);
  const dateText = zplEscape(formatProductionLabelBlockDate(printedAt));
  const timeText = zplEscape(formatProductionLabelBlockTime(printedAt));
  const photoQrUrl = String(opts.imageQrUrl || '').trim()
    || buildProductPhotoQrUrl(String(opts.sku || '').trim());
  const imageQr = qrEscape(photoQrUrl);
  const companyLine = zplEscape(COMPANY_NAME);

  const labelField = (y, text) => (
    `^FO${d.labelX},${y}^A0N,${hf},${hf}^FD${text}^FS`
  );
  const valueField = (y, text, maxLines = 1) => (
    `^FO0,${y}^A0N,${vf},${vf}^FB${d.labelWidth},${maxLines},0,C,0^FD${text}^FS`
  );

  const barcodeH = d.barcodeHeight;
  const barcodeModule = Math.max(2, Math.min(3, Math.floor(d.barcodeWidth / (skuText.length * 11 + 35))));
  const imageMag = zebraQrMagnification(d.qrSize, imageQr.length);

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
    labelField(d.dateRowY, FIELD_LABELS.date),
    valueField(d.dateRowY, dateText),
    labelField(d.timeRowY, FIELD_LABELS.time),
    valueField(d.timeRowY, timeText),
    `^PQ${copies}`,
    '^XZ',
  ];

  return `${lines.join('\n')}\n`;
}

export {
  COMPANY_NAME,
  formatProductionLabelBlockDate as formatBlockDate,
  formatProductionLabelBlockTime as formatBlockTime,
};
