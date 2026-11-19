export function isOrdersAppShowroomQuote(row) {
  return row?.routing?.metadata?.showroom_order === true;
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

export function showroomQuoteListSearchBlob(row) {
  const meta = row?.routing?.metadata || {};
  const route = String(row?.routing?.route || '').toLowerCase();
  const lines = Array.isArray(meta.lines) ? meta.lines : [];
  const products = lines.map((l) => String(l.name || '')).join(' ');
  return [
    row.quote_number,
    row.created_at,
    route,
    products,
  ].join(' ').toLowerCase();
}