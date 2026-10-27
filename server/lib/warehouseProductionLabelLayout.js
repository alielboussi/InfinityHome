/** Shared mm layout — 80×68 mm production labels (label/value columns, outer border only). */

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

export const FONT_PT = 12;
export const ROW_TEXT_MM = 4.2;
export const NAME_ROW_MM = 5.2;
export const BLOCK_GAP_MM = 0.65;

export const FIELD_LABELS = {
  sku: 'SKU:',
  name: 'Name:',
  date: 'Date:',
  time: 'Time:',
};

function mmToDots(mm, dpi = 203) {
  return Math.round(Number(mm) * (Number(dpi) / 25.4));
}

function advanceBlock(y, contentHeightMm, gapAfterMm = BLOCK_GAP_MM) {
  const rowY = y;
  const nextY = y + contentHeightMm + gapAfterMm;
  return { rowY, nextY };
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
  y = companyRowMm + COMPANY_ROW_MM + BLOCK_GAP_MM;

  const barcodeTopMm = y;
  y += BARCODE_HEIGHT_MM + BLOCK_GAP_MM + 0.35;

  let block = advanceBlock(y, ROW_TEXT_MM);
  const skuRowMm = block.rowY;
  y = block.nextY;

  block = advanceBlock(y, NAME_ROW_MM);
  const nameRowMm = block.rowY;
  y = block.nextY + 0.25;

  const qrBlockYMm = y;
  const imageQrLeftMm = centerXMm - QR_SIZE_MM / 2;
  const imageQrCenterMm = centerXMm;
  y += QR_SIZE_MM + BLOCK_GAP_MM + 0.35;

  block = advanceBlock(y, ROW_TEXT_MM);
  const dateRowMm = block.rowY;
  y = block.nextY;

  block = advanceBlock(y, ROW_TEXT_MM);
  const timeRowMm = block.rowY;

  const zplFont = Math.round(FONT_PT * (dpi / 72));
  const toDots = (mm) => mmToDots(mm, dpi);
  const baselineDots = (rowStartMm, rowContentMm) => toDots(rowTextBaselineMm(rowStartMm, rowContentMm));

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
    skuRowMm,
    nameRowMm,
    qrBlockYMm,
    imageQrLeftMm,
    imageQrCenterMm,
    qrSizeMm: QR_SIZE_MM,
    dateRowMm,
    timeRowMm,
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
      skuRowY: baselineDots(skuRowMm, ROW_TEXT_MM),
      nameRowY: baselineDots(nameRowMm, NAME_ROW_MM),
      qrBlockY: toDots(qrBlockYMm),
      imageQrX: toDots(imageQrLeftMm),
      qrSize: toDots(QR_SIZE_MM),
      dateRowY: baselineDots(dateRowMm, ROW_TEXT_MM),
      timeRowY: baselineDots(timeRowMm, ROW_TEXT_MM),
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
