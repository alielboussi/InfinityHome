/** Shared mm layout — 80×68 mm production labels (row + label/value columns). */

export const COMPANY_NAME = 'Bestrest Furniture';

export const LABEL_WIDTH_MM = 80;
export const LABEL_HEIGHT_MM = 68;
/** Gap between die-cut labels on the roll (0.3 cm). */
export const LABEL_GAP_MM = 3;
export const LABEL_MARGIN_MM = 2;

/** Label pitch for ZPL ^LL (face height + inter-label gap). */
export function labelPitchMm(heightMm = LABEL_HEIGHT_MM, gapMm = LABEL_GAP_MM) {
  return Number(heightMm) + Number(gapMm);
}

export const BARCODE_WIDTH_MM = 40;
export const BARCODE_HEIGHT_MM = 10;

/** Field headers start 2 cm from the left edge of the label. */
export const HEADER_START_MM = 20;

export const QR_SIZE_MM = 9;

export const FONT_PT = 16;
export const ROW_TEXT_MM = 5;
export const ROW_LINE_GAP_MM = 1.5;
export const ROW_AFTER_LINE_MM = 1.5;

export const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Name:',
  photo: 'Photo:',
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

export function computeProductionLabelLayout({
  heightMm = LABEL_HEIGHT_MM,
  marginMm = LABEL_MARGIN_MM,
  dpi = 203,
} = {}) {
  const mainWidthMm = LABEL_WIDTH_MM - marginMm * 2;
  const centerXMm = LABEL_WIDTH_MM / 2;
  const barcodeLeftMm = (LABEL_WIDTH_MM - BARCODE_WIDTH_MM) / 2;

  let y = marginMm + 1.5;
  const companyMm = y;
  y += 4.5;
  const companyUnderlineMm = y;
  y += 1.5;
  const barcodeTopMm = y;
  y += BARCODE_HEIGHT_MM + 1.5;
  const afterBarcodeLineMm = y;
  y += ROW_AFTER_LINE_MM;

  let block = advanceRow(y, ROW_TEXT_MM);
  const skuRowMm = block.rowY;
  const skuLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, ROW_TEXT_MM);
  const nameRowMm = block.rowY;
  const nameLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, Math.max(ROW_TEXT_MM, QR_SIZE_MM));
  const photoRowMm = block.rowY;
  const photoLineMm = block.lineMm;
  y = block.nextY;

  block = advanceRow(y, ROW_TEXT_MM);
  const dateRowMm = block.rowY;
  const dateLineMm = block.lineMm;
  y = block.nextY;

  const timeRowMm = y;

  const zplFont = Math.round(FONT_PT * (dpi / 72));
  const toDots = (mm) => mmToDots(mm, dpi);

  return {
    marginMm,
    mainWidthMm,
    centerXMm,
    headerStartMm: HEADER_START_MM,
    barcodeLeftMm,
    barcodeTopMm,
    barcodeWidthMm: BARCODE_WIDTH_MM,
    barcodeHeightMm: BARCODE_HEIGHT_MM,
    companyMm,
    companyUnderlineMm,
    afterBarcodeLineMm,
    skuRowMm,
    skuLineMm,
    nameRowMm,
    nameLineMm,
    photoRowMm,
    photoLineMm,
    qrSizeMm: QR_SIZE_MM,
    dateRowMm,
    dateLineMm,
    timeRowMm,
    fontPt: FONT_PT,
    dots: {
      margin: toDots(marginMm),
      mainWidth: toDots(mainWidthMm),
      centerX: toDots(centerXMm),
      headerX: toDots(HEADER_START_MM),
      labelWidth: toDots(LABEL_WIDTH_MM),
      barcodeLeft: toDots(barcodeLeftMm),
      barcodeTop: toDots(barcodeTopMm),
      barcodeWidth: toDots(BARCODE_WIDTH_MM),
      barcodeHeight: toDots(BARCODE_HEIGHT_MM),
      companyY: toDots(companyMm),
      companyUnderlineY: toDots(companyUnderlineMm),
      afterBarcodeLineY: toDots(afterBarcodeLineMm),
      skuRowY: toDots(skuRowMm),
      skuLineY: toDots(skuLineMm),
      nameRowY: toDots(nameRowMm),
      nameLineY: toDots(nameLineMm),
      photoRowY: toDots(photoRowMm),
      photoLineY: toDots(photoLineMm),
      qrSize: toDots(QR_SIZE_MM),
      dateRowY: toDots(dateRowMm),
      dateLineY: toDots(dateLineMm),
      timeRowY: toDots(timeRowMm),
      boxW: toDots(mainWidthMm),
      boxH: toDots(heightMm - marginMm * 2),
      headerFont: zplFont,
      valueFont: zplFont,
      companyFont: Math.round(14 * (dpi / 72)),
    },
  };
}

export { mmToDots };
