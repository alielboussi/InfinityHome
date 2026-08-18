import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BackToDashboard from './BackToDashboard';
import { listWebOrders } from './services/shopApi';
import './ecommerce-sales.css';

const STATUS_FILTERS = [
  { id: 'confirmed', label: 'Paid' },
  { id: 'awaiting_payment', label: 'Awaiting payment' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

function formatMoney(amount, currency = 'K') {
  const sym = String(currency || 'K').toUpperCase() === 'USD' ? '$' : 'K';
  const n = Number(amount || 0);
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym} ${formatted}`;
}

function orderCustomerName(order) {
  const customer = order?.customer || {};
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return name || '—';
}

function orderDisplayId(order) {
  const id = String(order?.id || '').trim();
  if (!id) return '—';
  return id.slice(0, 8).toUpperCase();
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function formatPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '—';
  if (raw.startsWith('260') && raw.length >= 12) {
    return `0${raw.slice(3)}`;
  }
  return raw;
}

function orderStatusLabel(status) {
  const norm = String(status || '').toLowerCase();
  if (norm === 'confirmed') return 'Paid';
  if (norm === 'awaiting_payment') return 'Awaiting payment';
  if (norm === 'failed') return 'Failed';
  if (norm === 'cancelled') return 'Cancelled';
  if (norm === 'pending') return 'Awaiting payment';
  return status || '—';
}

function orderStatusClass(status) {
  const norm = String(status || '').toLowerCase();
  if (norm === 'confirmed') return 'confirmed';
  if (norm === 'failed' || norm === 'cancelled') return 'cancelled';
  return 'pending';
}

export default function EcommerceSales() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listWebOrders({ status: statusFilter });
      setOrders(rows || []);
    } catch (e) {
      setError(e?.message || 'Failed to load e-commerce orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...orders].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return bTime - aTime;
    });
    if (!term) return sorted;
    return sorted.filter((order) => {
      const customer = order?.customer || {};
      const haystack = [
        order.id,
        orderCustomerName(order),
        customer.phone,
        customer.email,
        customer.address,
        customer.city,
        order.receipt_number,
        order.payment_provider,
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, search]);

  const closeDetail = () => setSelectedOrder(null);

  return (
    <div className="ecom-sales">
      <div className="ecom-sales__header">
        <BackToDashboard />
        <div>
          <h1>E-commerce Sales</h1>
          <p className="ecom-sales__sub">
            Online orders complete automatically when MTN or Airtel payment is received. Stock is deducted on paid orders only.
          </p>
        </div>
        <button type="button" className="ecom-sales__refresh" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="ecom-sales__toolbar">
        <div className="ecom-sales__filters" role="tablist" aria-label="Order status">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === filter.id}
              className={`ecom-sales__filter${statusFilter === filter.id ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order ID, customer, phone, address…"
          className="ecom-sales__search"
        />
        <span className="ecom-sales__count">{filtered.length} orders</span>
      </div>

      {error && <p className="ecom-sales__error">{error}</p>}
      {loading && !orders.length && <p>Loading orders…</p>}
      {!loading && !filtered.length && (
        <p className="ecom-sales__empty">No orders in this view yet.</p>
      )}

      {filtered.length > 0 && (
        <div className="ecom-sales__table-wrap">
          <table className="ecom-sales__table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Phone Number</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  className="ecom-sales__row"
                  onClick={() => setSelectedOrder(order)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedOrder(order);
                    }
                  }}
                >
                  <td className="ecom-sales__id" title={order.id}>{orderDisplayId(order)}</td>
                  <td>{orderCustomerName(order)}</td>
                  <td>{formatPhone(order.customer?.phone)}</td>
                  <td>{String(order.payment_provider || '—').toUpperCase()}</td>
                  <td>{formatMoney(order.total_amount, order.currency)}</td>
                  <td>
                    <span className={`ecom-sales__status ecom-sales__status--${orderStatusClass(order.status)}`}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <div className="ecom-sales-modal" role="dialog" aria-modal="true" onClick={closeDetail}>
          <div className="ecom-sales-modal__panel" onClick={(e) => e.stopPropagation()}>
            <div className="ecom-sales-modal__head">
              <div>
                <h2>Order {orderDisplayId(selectedOrder)}</h2>
                <p className="ecom-sales__sub">{formatWhen(selectedOrder.created_at)}</p>
              </div>
              <button type="button" className="ecom-sales-modal__close" onClick={closeDetail} aria-label="Close">
                ×
              </button>
            </div>

            <div className="ecom-sales-modal__customer">
              <p><strong>{orderCustomerName(selectedOrder)}</strong></p>
              <p>{formatPhone(selectedOrder.customer?.phone)} · {selectedOrder.customer?.email || '—'}</p>
              <p>{selectedOrder.customer?.address || '—'}, {selectedOrder.customer?.city || '—'}</p>
              <p>Status: {orderStatusLabel(selectedOrder.status)}</p>
              {selectedOrder.payment_provider && <p>Payment: {String(selectedOrder.payment_provider).toUpperCase()}</p>}
              {selectedOrder.receipt_number && <p>Receipt: {selectedOrder.receipt_number}</p>}
              {selectedOrder.payment_failure_reason && (
                <p className="ecom-sales__cancel-reason">Payment failed: {selectedOrder.payment_failure_reason}</p>
              )}
            </div>

            <h3 className="ecom-sales-modal__items-title">Items purchased</h3>
            <table className="ecom-sales-modal__items">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedOrder.items || []).map((item) => {
                  const lineTotal = Number(item.unit_price || 0) * Number(item.quantity || 0);
                  return (
                    <tr key={`${selectedOrder.id}-${item.product_id}-${item.display_name}`}>
                      <td>{item.display_name}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.unit_price, item.currency || selectedOrder.currency)}</td>
                      <td>{formatMoney(lineTotal, item.currency || selectedOrder.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>Order total</strong></td>
                  <td><strong>{formatMoney(selectedOrder.total_amount, selectedOrder.currency)}</strong></td>
                </tr>
              </tfoot>
            </table>

            <p className="ecom-sales-modal__meta">
              Full order ID: <code>{selectedOrder.id}</code>
              {selectedOrder.sale_id && (
                <> · POS sale: <code>{selectedOrder.sale_id}</code></>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
