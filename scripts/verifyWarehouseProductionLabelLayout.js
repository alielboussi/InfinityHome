/**
 * Layout must fit 80×68 mm for all optional row combinations (incl. dimensions).
 */
async function main() {
  const { buildProductPhotoQrUrl } = await import('../server/lib/productPhotoBySku.js');
  const {
    computeProductionLabelLayout,
    assertProductionLabelFits,
    LABEL_HEIGHT_MM,
    LABEL_MARGIN_MM,
  } = await import('../server/lib/warehouseProductionLabelLayout.js');

  const qrLen = buildProductPhotoQrUrl('WHF2-DEMO-0001').length;
  const cases = [];
  for (const includeColorRow of [false, true]) {
    for (const includeBoxRow of [false, true]) {
      for (const includeDimensionsRow of [false, true]) {
        cases.push({ includeColorRow, includeBoxRow, includeDimensionsRow });
      }
    }
  }
  for (const opts of cases) {
    const layout = computeProductionLabelLayout({
      ...opts,
      imageQrDataLength: qrLen,
    });
    assertProductionLabelFits(layout, LABEL_HEIGHT_MM, LABEL_MARGIN_MM);
    const nameBottom = Number(layout.nameBlockTopMm) + Number(layout.nameBlockHeightMm);
    if (layout.qrBlockYMm < nameBottom + 0.6) {
      throw new Error(`QR overlaps Name: qrY=${layout.qrBlockYMm.toFixed(2)} nameBottom=${nameBottom.toFixed(2)}`);
    }
    const qrBottom = Number(layout.qrBlockYMm) + Number(layout.qrFootprintMm);
    if (layout.dateRowMm < qrBottom + 0.7) {
      throw new Error(`Date overlaps QR: dateY=${layout.dateRowMm.toFixed(2)} qrBottom=${qrBottom.toFixed(2)}`);
    }
  }

  const simple = computeProductionLabelLayout({ imageQrDataLength: qrLen });
  if (simple.qrFootprintMm < 18) {
    throw new Error(`Photo QR too small: ${simple.qrFootprintMm.toFixed(2)}mm`);
  }

  const worst = computeProductionLabelLayout({
    includeColorRow: true,
    includeBoxRow: true,
    includeDimensionsRow: true,
    imageQrDataLength: qrLen + 40,
  });
  assertProductionLabelFits(worst, LABEL_HEIGHT_MM, LABEL_MARGIN_MM);

  console.log('verifyWarehouseProductionLabelLayout: ok', cases.length + 2, 'cases');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
