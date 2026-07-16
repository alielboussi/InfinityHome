import React, { useEffect } from 'react';
import POS from './POS';

// Mobile wrapper that reuses full POS features, with mobile-specific CSS overrides
export default function POSMobile() {
  // One UI niceties: edge-to-edge, dynamic theme color for status/navigation bars
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('oneui');
    // Detect preferred color scheme
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const lightColor = '#e0f7fa';
    const darkColor = '#0d2633';
    const themeColor = prefersDark ? darkColor : lightColor;
    // Apply color-scheme for proper form controls rendering
    root.style.setProperty('color-scheme', prefersDark ? 'dark' : 'light');
    // Update meta theme-color to blend with One UI bars
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', themeColor);
    // Cleanup on unmount
    return () => {
      root.classList.remove('oneui');
    };
  }, []);

  return (
    <div className="pos-mobile">
      <POS isMobile={true} />
    </div>
  );
}
