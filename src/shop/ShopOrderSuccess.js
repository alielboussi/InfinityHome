import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function ShopOrderSuccess() {
  const location = useLocation();
  const orderId = location.state?.orderId || '';

  return (
    <div className="shop-page shop-page--narrow shop-success">
      <h1>Thank you!</h1>
      <p>Your payment was received and your order is confirmed.</p>
      {location.state?.receiptNumber && (
        <p className="shop-muted">Receipt: <strong>{location.state.receiptNumber}</strong></p>
      )}
      {orderId && <p className="shop-muted">Order reference: <strong>{orderId}</strong></p>}
      <Link to="/shop/products" className="shop-btn shop-btn--primary">Continue shopping</Link>
    </div>
  );
}
