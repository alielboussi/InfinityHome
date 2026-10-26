/** Zebra ZPL — warehouse production labels (80×68 mm, labelled rows). */

import { buildProductPhotoQrUrl } from './productPhotoBySku.js';
import {
  COMPANY_NAME,
  computeProductionLabelLayout,
  FIELD_LABELS,
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_MARGIN_MM,
  LABEL_WIDTH_MM,
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
    `^FO${d.headerX},${y}^A0N,${hf},${hf}^FD${text}^FS`
  );
  const valueField = (y, text) => (
    `^FO0,${y}^A0N,${vf},${vf}^FB${d.labelWidth},1,0,C,0^FD${text}^FS`
  );
  const hr = (y) => `^FO${mainX},${y}^GB${mainW},1,1^FS`;

  const barcodeH = d.barcodeHeight;
  const barcodeModule = Math.max(2, Math.min(3, Math.floor(d.barcodeWidth / (skuText.length * 11 + 35))));
  const nameQr = qrEscape(nameRaw);
  const qrMag = zebraQrMagnification(d.qrSize, Math.max(imageQr.length, nameQr.length));
  const capF = d.qrCaptionFont;
  const capW = d.qrColumnWidth;
  const capUl = d.qrCaptionUnderlineY;

  const qrCaption = (labelX, labelText) => [
    `^FO${labelX},${d.qrCaptionY}^A0N,${capF},${capF}^FB${capW},1,0,C,0^FD${zplEscape(labelText)}^FS`,
    `^FO${labelX},${capUl}^GB${capW},1,1^FS`,
  ];

  const lines = [
    '^XA',
    '^CI28',
    `^PW${widthDots}`,
    `^LL${mmToDots(pitchMm, dpi)}`,
    '^LH0,0',
    `^FO${mainX},${d.margin}^GB${d.boxW},${d.boxH},2^FS`,
    `^FO${mainX},${d.companyY}^A0N,${cf},${cf}^FB${mainW},1,0,C,0^FD${companyLine}^FS`,
    hr(d.companyUnderlineY),
    `^FO${d.barcodeLeft},${d.barcodeTop}^BY${barcodeModule},3,${Math.max(5, Math.floor(barcodeH / 10))}^BCN,${barcodeH},N,N,N^FD${skuText}^FS`,
    hr(d.afterBarcodeLineY),
    labelField(d.skuRowY, FIELD_LABELS.sku),
    valueField(d.skuRowY, skuText),
    hr(d.skuLineY),
    labelField(d.nameRowY, FIELD_LABELS.name),
    valueField(d.nameRowY, nameText),
    hr(d.nameLineY),
    ...qrCaption(d.imageQrLabelX, FIELD_LABELS.imageQr),
    ...qrCaption(d.nameQrLabelX, FIELD_LABELS.nameQr),
    ...(imageQr
      ? [`^FO${d.imageQrX},${d.qrBlockY}^BQN,2,${qrMag}^FDLA,${imageQr}^FS`]
      : []),
    ...(nameQr
      ? [`^FO${d.nameQrX},${d.qrBlockY}^BQN,2,${qrMag}^FDLA,${nameQr}^FS`]
      : []),
    hr(d.photoLineY),
    labelField(d.dateRowY, FIELD_LABELS.date),
    valueField(d.dateRowY, dateText),
    hr(d.dateLineY),
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
