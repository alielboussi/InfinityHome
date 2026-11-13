import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

export function fetchOrdersAccess() {
  return warehouseMobileRequest('orders-access-self');
}

export function fetchOrdersCustomers() {
  return warehouseMobileRequest('orders-customers-list');
}

export function saveOrdersCustomer(body) {
  return warehouseMobileRequest('orders-customer-save', body);
}

export function fetchOrdersProducts() {
  return warehouseMobileRequest('orders-products-list');
}

export function saveOrdersProduct(body) {
  return warehouseMobileRequest('orders-product-save', body);
}

export function fetchOrdersUnits() {
  return warehouseMobileRequest('orders-units-list');
}

export function fetchOrdersQuotes() {
  return warehouseMobileRequest('orders-quotes-list');
}

export function fetchOrdersQuote(quoteId) {
  return warehouseMobileRequest('orders-quote-get', { quote_id: quoteId });
}

export function fetchOrdersQuotePdf(quoteId) {
  return warehouseMobileRequest('orders-quote-pdf', { quote_id: quoteId });
}

export function saveOrdersQuote(body) {
  return warehouseMobileRequest('orders-quote-save', body);
}

export function deleteOrdersQuote(quoteId) {
  return warehouseMobileRequest('orders-quote-delete', { quote_id: quoteId });
}

export function setOrdersQuoteRoute(quoteId, route) {
  return warehouseMobileRequest('orders-quote-set-route', { quote_id: quoteId, route });
}

export function sendOrdersQuoteProduction(quoteId) {
  return warehouseMobileRequest('orders-quote-send-production', { quote_id: quoteId });
}

export function fetchOrdersDeliveries() {
  return warehouseMobileRequest('orders-deliveries-list');
}

export function fetchOrdersDelivery(sessionId) {
  return warehouseMobileRequest('orders-delivery-get', { session_id: sessionId });
}

export function setOrdersDeliveryReceiverCheck(entryId, checked) {
  return warehouseMobileRequest('orders-delivery-receiver-check', { entry_id: entryId, checked });
}

export function setOrdersDeliverySendToCustomer(entryId, send) {
  return warehouseMobileRequest('orders-delivery-send-to-customer', { entry_id: entryId, send });
}

export function acceptOrdersDelivery(sessionId) {
  return warehouseMobileRequest('orders-delivery-accept', { session_id: sessionId });
}

export function fetchOrdersRepairs() {
  return warehouseMobileRequest('orders-repairs-list');
}

export function fetchOrdersReturnProducts() {
  return warehouseMobileRequest('orders-return-products-list');
}

export function createOrdersReturn(body) {
  return warehouseMobileRequest('orders-return-create', body);
}

export function fetchOrdersTracking(params = {}) {
  return warehouseMobileRequest('orders-tracking-list', {
    department: params.department || undefined,
  });
}

export function fetchOrdersStorage() {
  return warehouseMobileRequest('orders-storage-list');
}

export function fetchOrdersKitweHassanInbound() {
  return warehouseMobileRequest('orders-kitwe-hassan-inbound');
}

export function fetchOrdersStoragePosSales() {
  return warehouseMobileRequest('orders-storage-pos-list');
}

export function fetchOrdersStoragePosDetail(saleId) {
  return warehouseMobileRequest('orders-storage-pos-detail', { sale_id: saleId });
}

export function submitOrdersStorageSend(body) {
  return warehouseMobileRequest('orders-storage-submit', body);
}
