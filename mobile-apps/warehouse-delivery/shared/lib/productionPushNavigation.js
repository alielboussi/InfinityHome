/**
 * Shared Expo push tap handling — prefers event_type, falls back to data.screen.
 */
export function navigateFromProductionPushData(navigationRef, data, routes) {
  const nav = navigationRef?.current;
  if (!nav?.navigate) return;

  const d = data && typeof data === 'object' ? data : {};
  const eventType = String(d.event_type || d.eventType || '').trim().toLowerCase();
  const screen = String(d.screen || '').trim();
  const quoteId = String(d.quote_id || '').trim();
  const jobId = String(d.job_id || d.painting_job_id || '').trim();
  const returnOrderId = String(d.return_order_id || '').trim();
  const storageSendId = String(d.storage_send_id || '').trim();

  const go = (name, params) => {
    if (!name) return false;
    nav.navigate(name, params);
    return true;
  };

  if (eventType === 'quotes' || eventType === 'quote') {
    const list = routes.quotesList;
    const detail = routes.quotesDetail;
    if (list) {
      nav.navigate(list);
      if (quoteId && detail) {
        nav.navigate(detail, { quote: { quote_id: quoteId } });
      }
      return;
    }
  }

  if (eventType === 'repairs' || eventType === 'repair') {
    if (routes.repairs) {
      const params = returnOrderId ? { returnOrderId } : undefined;
      nav.navigate(routes.repairs, params);
      return;
    }
  }

  if (eventType === 'painting_jobs' || eventType === 'painting_job') {
    if (routes.jobs) {
      const params = jobId ? { focusJobId: jobId } : undefined;
      nav.navigate(routes.jobs, params);
      return;
    }
  }

  if (eventType === 'jobs' || eventType === 'job') {
    if (routes.jobs) {
      const params = jobId ? { focusJobId: jobId } : undefined;
      nav.navigate(routes.jobs, params);
      return;
    }
  }

  if (eventType === 'delivery_repairs' || screen === 'DeliveryRepairQueue') {
    if (routes.deliveryRepairs) {
      nav.navigate(routes.deliveryRepairs);
      return;
    }
  }

  if (eventType === 'delivery_orders' || screen === 'DeliveryOrderQueue') {
    if (routes.deliveryOrders) {
      nav.navigate(routes.deliveryOrders);
      return;
    }
  }

  if (screen === routes.soldOrders || screen === 'SoldOrders') {
    if (routes.soldOrders) {
      nav.navigate(routes.soldOrders);
      if (storageSendId && routes.soldOrderDetail) {
        nav.navigate(routes.soldOrderDetail, { id: storageSendId });
      }
      return;
    }
  }

  if (screen && go(screen)) return;

  const quoteScreens = new Set([
    routes.quotesList,
    routes.quotesDetail,
    'UpholsteryQuotes',
    'UpholsteryQuoteDetail',
    'Quotes',
    'QuoteDetail',
  ].filter(Boolean));

  if (quoteScreens.has(screen)) {
    const list = routes.quotesList || (screen.includes('Upholstery') ? 'UpholsteryQuotes' : 'Quotes');
    const detail = routes.quotesDetail || (screen.includes('Upholstery') ? 'UpholsteryQuoteDetail' : 'QuoteDetail');
    nav.navigate(list);
    if (quoteId) nav.navigate(detail, { quote: { quote_id: quoteId } });
    return;
  }

  if (screen === 'Jobs' && routes.jobs) {
    nav.navigate(routes.jobs, jobId ? { focusJobId: jobId } : undefined);
    return;
  }

  if (screen === 'Repairs' && routes.repairs) {
    nav.navigate(routes.repairs, returnOrderId ? { returnOrderId } : undefined);
    return;
  }

  if (screen === 'Orders' && routes.jobs) {
    nav.navigate(routes.jobs, returnOrderId ? { returnOrderId } : undefined);
  }
}
