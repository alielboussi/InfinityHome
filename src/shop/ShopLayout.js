import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SHOP_PROMO_BANNER, SHOP_SUPPORT_EMAIL } from '../utils/shopContent';
import { shopCartCount, readShopCart } from './shopCartStorage';
import './shop.css';

export default function ShopLayout() {
  const navigate = useNavigate();
  const [cartCount, setCartCount] = React.useState(shopCartCount());

  React.useEffect(() => {
    const refresh = () => setCartCount(shopCartCount());
    window.addEventListener('storage', refresh);
    window.addEventListener('shop-cart-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('shop-cart-updated', refresh);
    };
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.add('shop-route');
    document.body.classList.add('shop-route');
    return () => {
      document.documentElement.classList.remove('shop-route');
      document.body.classList.remove('shop-route');
    };
  }, []);

  const bumpCart = () => {
    setCartCount(shopCartCount(readShopCart()));
    window.dispatchEvent(new Event('shop-cart-updated'));
  };

  return (
    <div className="shop-shell">
      <header className="shop-header">
        <div className="shop-header__inner">
          <nav className="shop-nav" aria-label="Main">
            <NavLink to="/shop" end className={({ isActive }) => `shop-nav__link${isActive ? ' is-active' : ''}`}>Home</NavLink>
            <NavLink to="/shop/products" className={({ isActive }) => `shop-nav__link shop-nav__link--cta${isActive ? ' is-active' : ''}`}>
              Products
            </NavLink>
            <NavLink to="/shop/about" className={({ isActive }) => `shop-nav__link${isActive ? ' is-active' : ''}`}>About</NavLink>
            <NavLink to="/shop/support" className={({ isActive }) => `shop-nav__link${isActive ? ' is-active' : ''}`}>Contact</NavLink>
          </nav>
          <button type="button" className="shop-cart-btn" onClick={() => navigate('/shop/cart')} aria-label="View cart">
            <span className="shop-cart-btn__icon" aria-hidden>🛒</span>
            <span>Cart</span>
            {cartCount > 0 && <span className="shop-cart-btn__badge">{cartCount}</span>}
          </button>
        </div>
        <div className="shop-promo-banner">
          <div className="shop-promo-banner__inner">
            <p className="shop-promo-banner__message">
              <strong>{SHOP_PROMO_BANNER.message}</strong>
            </p>
            <Link to={SHOP_PROMO_BANNER.link} className="shop-promo-banner__link">
              {SHOP_PROMO_BANNER.linkLabel} →
            </Link>
          </div>
        </div>
      </header>
      <main className="shop-main">
        <Outlet context={{ bumpCart }} />
      </main>
      <footer className="shop-footer">
        <div className="shop-footer__grid">
          <div className="shop-footer__brand">
            <strong>Infinity Home</strong>
            <p>Quality furniture and home essentials for every room.</p>
          </div>
          <div>
            <strong>Shop</strong>
            <ul>
              <li><Link to="/shop/products">All products</Link></li>
              <li><Link to="/shop/about">About us</Link></li>
              <li><Link to="/shop/support">Contact</Link></li>
            </ul>
          </div>
          <div>
            <strong>Contact</strong>
            <ul>
              <li><a href={`mailto:${SHOP_SUPPORT_EMAIL}`}>{SHOP_SUPPORT_EMAIL}</a></li>
              <li><Link to="/shop/support">Customer support</Link></li>
            </ul>
          </div>
        </div>
        <p className="shop-footer__copy">© {new Date().getFullYear()} Infinity Home. All rights reserved.</p>
      </footer>
    </div>
  );
}
