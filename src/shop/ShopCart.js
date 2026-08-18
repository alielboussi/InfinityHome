import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { readShopCart, shopCartTotal, updateShopCartQty } from './shopCartStorage';

function formatPrice(amount, currency) {
  const n = Number(amount || 0);
  const sym = String(currency || 'K').toUpperCase() === 'USD' ? '$' : 'K';
  return `${sym} ${n.toLocaleString()}`;
}

export default function ShopCart() {
  const navigate = useNavigate();
  const { bumpCart } = useOutletContext() || {};
  const [cart, setCart] = useState(readShopCart());

  useEffect(() => {
    setCart(readShopCart());
  }, []);

  const refresh = (next) => {
    setCart(next);
    bumpCart?.();
  };

  const total = shopCartTotal(cart);
  const currency = cart[0]?.currency || 'K';

  if (!cart.length) {
    return (
      <div className="shop-page shop-page--narrow">
        <h1>Your cart</h1>
        <p className="shop-muted">Your cart is empty.</p>
        <Link to="/shop/products" className="shop-btn shop-btn--primary">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="shop-page shop-page--narrow">
      <h1>Your cart</h1>
      <div className="shop-cart-list">
        {cart.map((row) => (
          <div key={row.id} className="shop-cart-row">
            <div className="shop-cart-row__info">
              <strong>{row.name}</strong>
              {row.variantName && <span className="shop-cart-row__variant">{row.variantName}</span>}
              <span>{formatPrice(row.price, row.currency)} each</span>
            </div>
            <div className="shop-cart-row__qty">
              <button type="button" onClick={() => refresh(updateShopCartQty(row.id, row.quantity - 1))}>−</button>
              <span>{row.quantity}</span>
              <button
                type="button"
                onClick={() => refresh(updateShopCartQty(row.id, row.quantity + 1))}
                disabled={row.maxQty > 0 && row.quantity >= row.maxQty}
              >
                +
              </button>
            </div>
            <div className="shop-cart-row__line">
              {formatPrice(row.price * row.quantity, row.currency)}
            </div>
          </div>
        ))}
      </div>
      <div className="shop-cart-summary">
        <span>Total</span>
        <strong>{formatPrice(total, currency)}</strong>
      </div>
      <button type="button" className="shop-btn shop-btn--primary shop-btn--block" onClick={() => navigate('/shop/checkout')}>
        Proceed to checkout
      </button>
    </div>
  );
}
