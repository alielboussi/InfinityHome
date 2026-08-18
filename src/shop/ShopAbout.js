import React from 'react';
import { Link } from 'react-router-dom';
import { SHOP_ABOUT_CONTENT } from '../utils/shopContent';

export default function ShopAbout() {
  return (
    <div className="shop-page shop-page--narrow shop-static">
      <p className="shop-section__eyebrow">Our story</p>
      <h1>{SHOP_ABOUT_CONTENT.title}</h1>
      <p className="shop-static__lead">{SHOP_ABOUT_CONTENT.intro}</p>
      {SHOP_ABOUT_CONTENT.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <div className="shop-static__links">
        <h2>Explore</h2>
        <ul>
          {SHOP_ABOUT_CONTENT.links.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <Link to="/shop/products" className="shop-btn shop-btn--primary">View catalogue</Link>
    </div>
  );
}
