export function estimateProductCardHeight(cardWidth, product) {
  const imageHeight = Math.round(cardWidth * 0.52);
  const name = String(product?.name || '');
  const charsPerLine = Math.max(12, Math.floor(cardWidth / 7.2));
  const nameLines = Math.max(2, Math.ceil(name.length / charsPerLine));
  const skuHeight = product?.sku ? 14 : 0;
  const bodyPadding = 20;
  const priceBlock = 38;
  return imageHeight + bodyPadding + nameLines * 16 + skuHeight + priceBlock;
}
