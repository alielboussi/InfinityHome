import {
  defaultMobileAccessGrant as buildDefaultGrant,
  sanitizeMobileAccessGrantForUser,
} from '../../src/mobile/mobileAccessManifest.js';

export function defaultMobileAccessGrant() {
  return buildDefaultGrant();
}

export function normalizeMobileAccessGrant(raw, userEmail = '') {
  const grant = raw && typeof raw === 'object' ? raw : {};
  return sanitizeMobileAccessGrantForUser(grant, userEmail);
}
