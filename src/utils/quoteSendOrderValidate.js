/** Guards before Hassan Send Order (web board + factory PDF). */

export function factoryOrderNamedLines(items = []) {
  return (items || []).filter((line) => {
    const name = String(
      line?.name_override || line?.name || line?.product_name || line?.quote_product_name || '',
    ).trim();
    return name.length > 0 && name !== '-';
  });
}

export function assertQuoteReadyForSendOrder(items = []) {
  const named = factoryOrderNamedLines(items);
  if (!named.length) {
    const err = new Error(
      'This order has no product lines. Open the quote, add at least one catalog product or Floor 2 WIP line, save, then Send Order.',
    );
    err.code = 'send_order_no_lines';
    throw err;
  }
  const totalQty = named.reduce((sum, line) => sum + Math.max(0, Number(line?.quantity) || 0), 0);
  if (totalQty < 1) {
    const err = new Error('Each order line needs quantity at least 1 before Send Order.');
    err.code = 'send_order_qty';
    throw err;
  }
}