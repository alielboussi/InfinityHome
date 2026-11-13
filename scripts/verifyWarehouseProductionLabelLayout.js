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
