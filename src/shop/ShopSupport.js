import React from 'react';
import { Link } from 'react-router-dom';
import { SHOP_SUPPORT_CONTENT } from '../utils/shopContent';
import { SHOP_WHATSAPP_E164 } from '../utils/shopConstants';

export default function ShopSupport() {
  const email = SHOP_SUPPORT_CONTENT.email;
  const waUrl = SHOP_WHATSAPP_E164 ? `https://wa.me/${SHOP_WHATSAPP_E164}` : '';

  return (
    <div className="shop-page shop-page--narrow shop-static">
      <p className="shop-section__eyebrow">We&apos;re here to help</p>
      <h1>{SHOP_SUPPORT_CONTENT.title}</h1>
      <p className="shop-static__lead">{SHOP_SUPPORT_CONTENT.intro}</p>

      <div className="shop-support-grid">
        <div className="shop-support-card">
          <h2>Email</h2>
          <p><a href={`mailto:${email}`}>{email}</a></p>
          <p className="shop-muted">We usually reply within one business day.</p>
        </div>

        {waUrl && (
          <div className="shop-support-card">
            <h2>WhatsApp</h2>
            <p>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
            </p>
            <p className="shop-muted">Fastest for product availability and orders.</p>
          </div>
        )}

        <div className="shop-support-card">
          <h2>Opening hours</h2>
          <p>{SHOP_SUPPORT_CONTENT.hours}</p>
        </div>
      </div>

      <ul>
        {SHOP_SUPPORT_CONTENT.bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <p className="shop-muted">{SHOP_SUPPORT_CONTENT.note}</p>

      <Link to="/shop/products" className="shop-btn shop-btn--primary">Browse products</Link>
    </div>
  );
}
