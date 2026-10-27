/** Shared mm layout — 80×68 mm production labels (row lines + label/value columns). */

export const COMPANY_NAME = 'Bestrest Furniture';

export const LABEL_WIDTH_MM = 80;
export const LABEL_HEIGHT_MM = 68;
/** Gap between die-cut labels on the roll (0.3 cm). */
export const LABEL_GAP_MM = 3;
export const LABEL_MARGIN_MM = 2;
/** Inner padding below the top border stroke before company name. */
export const BORDER_TOP_INSET_MM = 1.6;
export const COMPANY_ROW_MM = 3.6;

/** Label pitch for ZPL ^LL (face height + inter-label gap). */
export function labelPitchMm(heightMm = LABEL_HEIGHT_MM, gapMm = LABEL_GAP_MM) {
  return Number(heightMm) + Number(gapMm);
}

export const BARCODE_WIDTH_MM = 40;
export const BARCODE_HEIGHT_MM = 7;

/** Left column: field headers (SKU:, Name:, …). */
export const LABEL_COL_MM = 3;
/** Values are centre-aligned on the label (same axis as Image QR). */
export const VALUE_CENTER_MM = LABEL_WIDTH_MM / 2;

export const QR_SIZE_MM = 10;
export const QR_CAPTION_HEIGHT_MM = 2.4;

export const FONT_PT = 12;
export const ROW_TEXT_MM = 4.2;
export const NAME_ROW_MM = 5.2;
export const ROW_LINE_GAP_MM = 0.8;
export const ROW_AFTER_LINE_MM = 0.6;

export const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Name:',
  imageQr: 'Image QR',
  date: 'Date:',
  time: 'Time:',
};

function mmToDots(mm, dpi = 203) {
  return Math.round(Number(mm) * (Number(dpi) / 25.4));
}

function advanceRow(y, contentHeightMm) {
  const lineMm = y + contentHeightMm + ROW_LINE_GAP_MM;
  const nextY = lineMm + ROW_AFTER_LINE_MM;
  return { rowY: y, lineMm, nextY };
}

/** ZPL/SVG text baseline within a row (FO y is top of glyph box). */
export function rowTextBaselineMm(rowStartMm, rowContentMm) {
  return rowStartMm + rowContentMm * 0.78;
}

export function computeProductionLabelLayout({
  heightMm = LABEL_HEIGHT_MM,
  marginMm = LABEL_MARGIN_MM,
  dpi = 203,
} = {}) {
  const mainWidthMm = LABEL_WIDTH_MM - marginMm * 2;
  const centerXMm = LABEL_WIDTH_MM / 2;
  const barcodeLeftMm = (LABEL_WIDTH_MM - BARCODE_WIDTH_MM) / 2;

  let y = marginMm + BORDER_TOP_INSET_MM;
  const companyRowMm = y;
  let block = advanceRow(companyRowMm, COMPANY_ROW_MM);
  const companyLineMm = block.lineMm;
  y = block.nextY;

  const barcodeTopMm = y;
  y += BARCODE_HEIGHT_MM + 1.2;
  const afterBarcodeLineMm = y + ROW_LINE_GAP_MM;
  y = afterBarcodeLineMm + ROW_AFTER_LINE_MM;

  block = advanceRow(y, ROW_TEXT_MM);
  const skuRowMm = block.rowY;
  const skuLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, NAME_ROW_MM);
  const nameRowMm = block.rowY;
  const nameLineMm = block.lineMm;
  y = block.nextY;

  const qrCaptionYMm = y;
  y += QR_CAPTION_HEIGHT_MM + 0.2;
  const qrBlockYMm = y;
  const imageQrLeftMm = centerXMm - QR_SIZE_MM / 2;
  const imageQrCenterMm = centerXMm;
  const qrCaptionWidthMm = QR_SIZE_MM + 4;
  const imageQrLabelLeftMm = imageQrCenterMm - qrCaptionWidthMm / 2;
  const photoContentMm = QR_CAPTION_HEIGHT_MM + 0.2 + QR_SIZE_MM;
  block = advanceRow(qrCaptionYMm, photoContentMm + 0.8);
  const photoLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, ROW_TEXT_MM);
  const dateRowMm = block.rowY;
  const dateLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, ROW_TEXT_MM);
  const timeRowMm = block.rowY;
  const timeLineMm = block.lineMm;

  const zplFont = Math.round(FONT_PT * (dpi / 72));
  const toDots = (mm) => mmToDots(mm, dpi);
  const baselineDots = (rowStartMm, rowContentMm) => toDots(rowTextBaselineMm(rowStartMm, rowContentMm));
  const lineDots = (mm) => toDots(mm);

  return {
    marginMm,
    mainWidthMm,
    centerXMm,
    valueCenterMm: VALUE_CENTER_MM,
    labelColMm: LABEL_COL_MM,
    barcodeLeftMm,
    barcodeTopMm,
    barcodeWidthMm: BARCODE_WIDTH_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
    companyRowMm,
    companyLineMm,
    afterBarcodeLineMm,
    skuRowMm,
    skuLineMm,
    nameRowMm,
    nameLineMm,
    qrCaptionYMm,
    qrBlockYMm,
    imageQrLeftMm,
    imageQrCenterMm,
    qrSizeMm: QR_SIZE_MM,
    qrCaptionWidthMm,
    imageQrLabelLeftMm,
    photoLineMm,
    dateRowMm,
    dateLineMm,
    timeRowMm,
    timeLineMm,
    fontPt: FONT_PT,
    dots: {
      margin: toDots(marginMm),
      mainWidth: toDots(mainWidthMm),
      centerX: toDots(centerXMm),
      labelX: toDots(LABEL_COL_MM),
      labelWidth: toDots(LABEL_WIDTH_MM),
      barcodeLeft: toDots(barcodeLeftMm),
      barcodeTop: toDots(barcodeTopMm),
      barcodeWidth: toDots(BARCODE_WIDTH_MM),
      barcodeHeight: toDots(BARCODE_HEIGHT_MM),
      companyY: toDots(rowTextBaselineMm(companyRowMm, COMPANY_ROW_MM)),
      companyLineY: lineDots(companyLineMm),
      afterBarcodeLineY: lineDots(afterBarcodeLineMm),
      skuRowY: baselineDots(skuRowMm, ROW_TEXT_MM),
      skuLineY: lineDots(skuLineMm),
      nameRowY: baselineDots(nameRowMm, NAME_ROW_MM),
      nameLineY: lineDots(nameLineMm),
      qrCaptionY: baselineDots(qrCaptionYMm, QR_CAPTION_HEIGHT_MM),
      qrBlockY: toDots(qrBlockYMm),
      imageQrX: toDots(imageQrLeftMm),
      imageQrLabelX: toDots(imageQrLabelLeftMm),
      qrCaptionWidth: toDots(qrCaptionWidthMm),
      qrSize: toDots(QR_SIZE_MM),
      qrCaptionFont: Math.round(9 * (dpi / 72)),
      photoLineY: lineDots(photoLineMm),
      dateRowY: baselineDots(dateRowMm, ROW_TEXT_MM),
      dateLineY: lineDots(dateLineMm),
      timeRowY: baselineDots(timeRowMm, ROW_TEXT_MM),
      timeLineY: lineDots(timeLineMm),
      boxW: toDots(mainWidthMm),
      boxH: toDots(heightMm - marginMm * 2),
      headerFont: zplFont,
      valueFont: zplFont,
      companyFont: Math.round(13 * (dpi / 72)),
      nameValueHeight: toDots(NAME_ROW_MM),
    },
  };
}

/** Zebra ^BQ magnification so QR prints ~targetDots wide (model 2). */
export function zebraQrMagnification(targetDots, dataLength = 40) {
  const modules = Math.max(21, Math.min(57, Math.ceil(Math.sqrt(Math.max(1, dataLength) * 12))));
  const mag = Math.round(Number(targetDots) / modules);
  return Math.max(3, Math.min(10, mag));
}

export { mmToDots };
