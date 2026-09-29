import { defaultMobileAccessGrant as buildDefaultGrant } from '../../src/mobile/mobileAccessManifest.js';

export function defaultMobileAccessGrant() {
  return buildDefaultGrant();
}

export function normalizeMobileAccessGrant(raw) {
  const base = defaultMobileAccessGrant();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    landing_screen: raw.landing_screen || base.landing_screen,
    screens: { ...base.screens, ...(raw.screens || {}) },
  };
}
