/** Workshop / delivery flags — keep aligned with src/utils/quoteShowroomOrder.js (API fields). */

export function isProductionQuoteShowroomOrder(quote) {
  return quote?.showroom_order === true;
}

export function isProductionQuoteCustomerOrder(quote) {
  if (isProductionQuoteShowroomOrder(quote)) return false;
  return quote?.customer_order === true;
}

export function firstProductionQuoteLineImageUrl(quote) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  for (const line of lines) {
    const meta = line?.metadata && typeof line.metadata === 'object' ? line.metadata : {};
    const url = String(
      line?.line_image_url || meta.line_image_url || meta.floor2_image_url || '',
    ).trim();
    if (url) return url;
  }
  return '';
}

export function productionQuoteListTitle(quote, tUi, locale) {
  if (isProductionQuoteShowroomOrder(quote)) {
    const lines = Array.isArray(quote?.lines) ? quote.lines : [];
    const firstName = String(lines[0]?.name || '').trim();
    return firstName || tUi('badgeShowroomOrder', locale);
  }
  const name = String(quote?.customer_name || '').trim();
  if (name) return name;
  return tUi('returnCustomer', locale);
}