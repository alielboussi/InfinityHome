import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; 
import App from './App'; 
import { isPublicAppRoute } from './accessControl';
import 'font-awesome/css/font-awesome.min.css';
import './global-theme.css';

// Force a single canonical host so all users (including on other PCs/Macs)
// hit the same deployment and API behavior without manual cache/cookie clearing.
(() => {
  if (typeof window === 'undefined') return;
  const host = String(window.location.hostname || '').toLowerCase();
  const canonicalHost = String(process.env.REACT_APP_CANONICAL_HOST || 'infinity-home-pi.vercel.app').toLowerCase();
  const legacyHosts = new Set(['infinityhome.app', 'www.infinityhome.app']);
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(host);
  if (isLocal || !legacyHosts.has(host) || host === canonicalHost) return;

  const next = `https://${canonicalHost}${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace(next);
})();

// Global date format: force dd/mm/yyyy (en-GB) whenever no explicit locale is
// passed to Date#toLocaleDateString / Date#toLocaleString. Number formatting is
// untouched (only Date.prototype is patched), so currency displays are unaffected.
(function enforceGlobalDateFormat(){
  if (typeof Date === 'undefined' || Date.prototype.__dmyPatched) return;
  const LOCALE = 'en-GB';
  const origDate = Date.prototype.toLocaleDateString;
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleDateString = function(locale, options){
    if (locale === undefined || locale === null) {
      return origDate.call(this, LOCALE, options || { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return origDate.call(this, locale, options);
  };
  const origDateTime = Date.prototype.toLocaleString;
  // eslint-disable-next-line no-extend-native
  Date.prototype.toLocaleString = function(locale, options){
    if (locale === undefined || locale === null) {
      return origDateTime.call(this, LOCALE, options);
    }
    return origDateTime.call(this, locale, options);
  };
  // eslint-disable-next-line no-extend-native
  try { Object.defineProperty(Date.prototype, '__dmyPatched', { value: true, enumerable: false }); } catch (_) {}
})();

// Suppress specific React Router v7 future flag warnings globally
(function(){
  const originalWarn = console.warn;
  const SUPPRESS_PATTERNS = [
    'React Router Future Flag Warning: React Router will begin wrapping state updates',
    'React Router Future Flag Warning: Relative route resolution within Splat routes'
  ];
  console.warn = function(...args){
    const msg = args[0] && String(args[0]);
    if (msg && SUPPRESS_PATTERNS.some(p=> msg.includes(p))) return; // swallow
    return originalWarn.apply(this, args);
  };
})();

const root = ReactDOM.createRoot(document.getElementById('root'));

// Global: disable browser pull-to-refresh (Android Chrome) while allowing normal vertical scroll
// If the page is at the top and the user pulls down, prevent default.
(() => {
  let startY = 0;
  const onTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) startY = e.touches[0].clientY;
  };
  const canScrollWithin = (target, dy) => {
    let node = target;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
        const atTop = node.scrollTop <= 0;
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
        if (dy > 0 && !atTop) return true;
        if (dy < 0 && !atBottom) return true;
      }
      node = node.parentElement;
    }
    return false;
  };
  const onTouchMove = (e) => {
    const path = String(window.location.pathname || '').toLowerCase();
    if (isPublicAppRoute(path)) return;
    const y = (typeof window.scrollY === 'number') ? window.scrollY : (document.documentElement.scrollTop || document.body.scrollTop || 0);
    const currentY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0;
    const dy = currentY - startY;
    if (canScrollWithin(e.target, dy)) return;
    if (y <= 0 && dy > 0) {
      e.preventDefault();
    }
  };
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
})();

root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
