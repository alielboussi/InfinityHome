import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchShopCatalog } from '../services/shopApi';
import {
  SHOP_DEFAULT_SETTINGS,
  SHOP_HERO_IMAGE,
  SHOP_WHY_CHOOSE,
  SHOP_SUPPORT_EMAIL,
} from '../utils/shopContent';
import { buildShopWhatsAppUrl } from '../utils/shopConstants';

export default function ShopLanding() {
  const [settings, setSettings] = useState(SHOP_DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchShopCatalog();
        if (!cancelled) {
          setSettings({ ...SHOP_DEFAULT_SETTINGS, ...(data?.settings || {}) });
        }
      } catch {
        // Landing still renders with defaults
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const waUrl = buildShopWhatsAppUrl({ productName: 'Infinity Home catalogue' })
    || (settings?.whatsappE164 ? `https://wa.me/${settings.whatsappE164}` : '');

  return (
    <div className="shop-landing">
      <section className="shop-hero-banner" style={{ backgroundImage: `url(${SHOP_HERO_IMAGE})` }}>
        <div className="shop-hero-banner__overlay" />
        <div className="shop-hero-banner__content">
          <p className="shop-hero-banner__eyebrow">Furniture &amp; Home Essentials</p>
          <h1>{settings.storeName || SHOP_DEFAULT_SETTINGS.storeName}</h1>
          <p className="shop-hero-banner__lead">
            {settings.tagline || SHOP_DEFAULT_SETTINGS.tagline}
          </p>
          <div className="shop-hero-banner__actions">
            <Link to="/shop/support" className="shop-btn shop-btn--outline-light shop-btn--lg">Get in touch</Link>
          </div>
        </div>
      </section>

      <section className="shop-section shop-section--why">
        <div className="shop-section__head shop-section__head--center">
          <p className="shop-section__eyebrow">Why Infinity Home</p>
          <h2>Everything you need, beautifully delivered</h2>
        </div>
        <div className="shop-why-grid">
          {SHOP_WHY_CHOOSE.map((item) => (
            <article key={item.title} className="shop-why-card">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shop-section shop-section--browse">
        <div className="shop-browse-cta">
          <p className="shop-section__eyebrow">Our catalogue</p>
          <h2>Find furniture and essentials for every room</h2>
          <p className="shop-section__sub">
            Browse live stock, pricing, and product details in our full catalogue.
          </p>
          <Link to="/shop/products" className="shop-btn shop-btn--primary shop-btn--lg shop-browse-cta__btn">
            Click here to begin browsing
          </Link>
        </div>
      </section>

      <section className="shop-cta-band">
        <div className="shop-cta-band__inner">
          <div>
            <h2>Ready to transform your space?</h2>
            <p>Browse our full catalogue or speak with our team for personalised recommendations.</p>
          </div>
          <div className="shop-cta-band__actions">
            <Link to="/shop/products" className="shop-btn shop-btn--light shop-btn--lg">Browse catalogue</Link>
            {waUrl ? (
              <a href={waUrl} className="shop-btn shop-btn--outline-light shop-btn--lg" target="_blank" rel="noopener noreferrer">
                WhatsApp us
              </a>
            ) : (
              <a href={`mailto:${SHOP_SUPPORT_EMAIL}`} className="shop-btn shop-btn--outline-light shop-btn--lg">
                Email us
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
