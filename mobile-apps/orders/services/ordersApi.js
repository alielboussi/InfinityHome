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

export function fetchOrdersQuotes() {
  return warehouseMobileRequest('orders-quotes-list');
}

export function fetchOrdersQuote(quoteId) {
  return warehouseMobileRequest('orders-quote-get', { quote_id: quoteId });
}

export function saveOrdersQuote(body) {
  return warehouseMobileRequest('orders-quote-save', body);
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

export function fetchOrdersRepairs() {
  return warehouseMobileRequest('orders-repairs-list');
}

export function fetchOrdersTracking() {
  return warehouseMobileRequest('orders-tracking-list');
}

export function fetchOrdersStorage() {
  return warehouseMobileRequest('orders-storage-list');
}
