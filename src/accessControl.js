// Hardcoded app permissions by user UUID / email.
// Do NOT load roles or route access from public.users or Firebase Auth metadata.role.

import { isStocktakeCountLocationPath } from './utils/stocktakeLocationSlug.js';

const USER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hassan Awad — quotationer-only: quotes, warehouse deliveries, read-only laybys. */
export const HASSAN_AWAD = Object.freeze({
  id: '6b992ac8-8e39-4f31-a323-2271a974da8c',
  emails: Object.freeze(['hassanawad18@gmail.com']),
  displayName: 'Hassan Awad',
  landingPath: '/quotationer',
  allowedRoutes: Object.freeze([
    '/quotationer',
    '/quotes-board',
    '/warehouse-deliveries',
    '/layby-management',
    '/lusaka-transfers',
  ]),
  quotationerOnly: true,
  canManageLaybys: false,
  canDeleteQuotations: false,
  canViewStocktake: false,
  lockedStockReportLocationId: '454a092c-5b12-441e-b99d-216f6fa72198',
});

const AUTH_EMAIL_TO_CANONICAL_USER_ID = new Map(
  HASSAN_AWAD.emails.map((email) => [email, HASSAN_AWAD.id]),
);
AUTH_EMAIL_TO_CANONICAL_USER_ID.set('alielboussi00@gmail.com', '1b5e098e-1206-447e-b4bc-6d009b85b5d3');
AUTH_EMAIL_TO_CANONICAL_USER_ID.set('husseinelboussizam@gmail.com', '99a0cdc5-1e67-40ff-93d4-a961cb9cff39');

export function isUserUuid(value) {
  return USER_UUID_RE.test(String(value || '').trim());
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch (_) {
    // ignore
  }
  return null;
}

/** Fixed counter URL — the only app page that does not require main login at /. */
export const STOCKTAKE_COUNT_PUBLIC_PATH = '/stocktake/count';

export function isPublicAppRoute(path) {
  const raw = String(path || '/').split('?')[0].split('#')[0];
  let p = raw;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return isStocktakeCountLocationPath(p);
}

export function isAppAuthenticated() {
  const user = getCurrentUser();
  if (!user) return false;
  try {
    return sessionStorage.getItem('bestrest:tabAuthed:v1') === '1';
  } catch {
    return false;
  }
}

// Map logged-in user to sales columns: user_uid (uuid) + user_id (legacy integer).
export function resolveSaleActor(user) {
  if (!user) return { user_uid: null, user_id: null };

  const explicitUid = user.user_uid ?? null;
  if (isUserUuid(explicitUid)) {
    const legacyId = Number(user.user_id);
    return {
      user_uid: String(explicitUid).trim(),
      user_id: Number.isFinite(legacyId) && legacyId > 0 ? legacyId : null,
    };
  }

  const rawId = user.id;
  if (isUserUuid(rawId)) {
    const legacyId = Number(user.user_id);
    return {
      user_uid: String(rawId).trim(),
      user_id: Number.isFinite(legacyId) && legacyId > 0 ? legacyId : null,
    };
  }

  const legacyFromField = Number(user.user_id);
  if (Number.isFinite(legacyFromField) && legacyFromField > 0) {
    return { user_uid: null, user_id: legacyFromField };
  }

  const legacyId = Number(rawId);
  if (Number.isFinite(legacyId) && legacyId > 0) {
    return { user_uid: null, user_id: legacyId };
  }

  return { user_uid: null, user_id: null };
}

// Route allowlist per UUID. '*' grants access to all routes.
// Add users here to restrict or allow specific paths.
const ROUTE_ALLOWLIST = new Map([
  [HASSAN_AWAD.id, [...HASSAN_AWAD.allowedRoutes]],
  // Ali El Boussi — full access
  ['1b5e098e-1206-447e-b4bc-6d009b85b5d3', ['*']],
  // User with full access (explicit) including stock report mobile across all locations
  ['8435e6ce-e24e-4140-9d12-3c96203127f0', ['*']],
  // Allow only Layby Management Mobile for this user
  ['dd826312-6b88-4d88-91e0-acb5e5b12f28', [
    '/layby-management-mobile',
  ]],
  // Stocktake-only users
  // Full route access; stock edits remain restricted via inventory permissions
  ['99a0cdc5-1e67-40ff-93d4-a961cb9cff39', ['*']],
  ['148d3357-0c7f-4600-99fa-6056c09e4014', [
    '/dashboard',
    '/categories',
    '/products',
    '/sets',
    '/products-list',
    '/stock-history',
    '/pos',
    '/reversal',
    '/stocktake',
    '/quotes-board',
    '/layby-management',
    '/price-labels',
    '/Kitwe-Lusaka',
    '/Kitwe-Lusaka-summary',
    '/All-Transfers',
    '/All-Transfers-summary',
  ]],
  ['44f085ee-8ade-4da4-9b2f-d39fd0a34179', [
    '/dashboard',
    '/categories',
    '/products',
    '/sets',
    '/products-list',
    '/stock-history',
    '/pos',
    '/reversal',
    '/stocktake',
    '/quotes-board',
    '/layby-management',
    '/price-labels',
    '/Kitwe-Lusaka',
    '/Kitwe-Lusaka-summary',
    '/All-Transfers',
    '/All-Transfers-summary',
  ]],
  // User d8bdaae7-3f1d-442d-a180-c14cb7fe0bc7 — full access
  ['d8bdaae7-3f1d-442d-a180-c14cb7fe0bc7', ['*']],
  // Example full access user:
  // ['<ali-uuid>', ['*']],
]);

// UUID -> Display Name (for banners and welcome messages)
const USER_DISPLAY_NAMES = new Map([
  ['1b5e098e-1206-447e-b4bc-6d009b85b5d3', 'Ali El Boussi'],
  ['99a0cdc5-1e67-40ff-93d4-a961cb9cff39', 'Hussen El Boussi'],
  [HASSAN_AWAD.id, HASSAN_AWAD.displayName],
  ['dd826312-6b88-4d88-91e0-acb5e5b12f28', 'Hassan El Boussi'],
  ['8435e6ce-e24e-4140-9d12-3c96203127f0', 'Houda El Boussi'],
  ['44f085ee-8ade-4da4-9b2f-d39fd0a34179', 'Kitwe Stocktake User'],
]);

// Route aliases: treat certain routes as equivalent for allowlist checks.
// Example: if '/stock-report-mobile' is allowed, '/stock-report-mobile-locked' is implicitly allowed.
const ROUTE_ALIASES = new Map([
  ['/stock-report-mobile-locked', '/stock-report-mobile'],
  ['/stocktake-entry', '/stocktake'],
  ['/stocktake-count', '/stocktake'],
  ['/stocktake-periods', '/stocktake-periods'],
  ['/KitweStocktake', '/stocktake'],
  ['/LusakaStocktake', '/stocktake'],
  ['/outlet-transfer', '/Kitwe-Lusaka'],
  ['/outlet-transfer-summary', '/Kitwe-Lusaka-summary'],
  ['/warehouse-transfer', '/All-Transfers'],
  ['/warehouse-transfer-summary', '/All-Transfers-summary'],
  ['/Factory-Kitwe', '/All-Transfers'],
  ['/Factory-Kitwe-summary', '/All-Transfers-summary'],
  // Treat legacy quotes paths as aliases to the consolidated Quotationer
  ['/quotes', '/quotes-board'],
  ['/quotes-dashboard', '/quotationer'],
  ['/quotes/create', '/quotationer'],
  ['/quotations', '/quotationer'],
  ['/quotes/view', '/quotes-board'],
  ['/quotations-list', '/quotes-board'],
  ['/quotes/customers', '/quotationer'],
  ['/quotes/products', '/quotationer'],
  ['/quotes/units', '/quotationer'],
  ['/QuotesDashboard', '/quotationer'],
  ['/QuotationsList', '/quotes-board'],
  ['/QuotesCustomers', '/quotationer'],
  ['/QuoteProducts', '/quotationer'],
  ['/QuotesUnits', '/quotationer'],
]);

function normalizePath(path) {
  // Normalize path (strip trailing slash except root)
  let p = path || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  // Apply alias mapping to canonical form (map locked -> base)
  if (ROUTE_ALIASES.has(p)) return ROUTE_ALIASES.get(p);
  return p;
}

function getUserUuid(user) {
  const explicitUid = String(user?.user_uid || '').trim().toLowerCase();
  if (isUserUuid(explicitUid)) return explicitUid;
  const idAsUuid = String(user?.id || '').trim().toLowerCase();
  if (isUserUuid(idAsUuid)) return idAsUuid;
  return '';
}

export function getUserDisplayName(user) {
  const id = getUserUuid(user);
  return USER_DISPLAY_NAMES.get(id) || user?.email || 'User';
}

function getUserEmail(user) {
  return String(user?.email || '').trim().toLowerCase();
}

// Email-based overrides are useful when a user's UUID can differ across environments.
const EMAIL_ROUTE_ALLOWLIST = new Map([
  ['husseinelboussizam@gmail.com', ['*']],
  [HASSAN_AWAD.emails[0], [...HASSAN_AWAD.allowedRoutes]],
]);

const PRODUCT_INVENTORY_RESTRICTED_USERS = new Set([
  '44f085ee-8ade-4da4-9b2f-d39fd0a34179',
  '99a0cdc5-1e67-40ff-93d4-a961cb9cff39',
  '148d3357-0c7f-4600-99fa-6056c09e4014',
]);

const PRODUCT_CATALOG_OVERRIDE_USERS = new Set([
  '99a0cdc5-1e67-40ff-93d4-a961cb9cff39',
]);

export function isProductInventoryRestrictedUser(user) {
  return PRODUCT_INVENTORY_RESTRICTED_USERS.has(getUserUuid(user));
}

export function canManageProductInventory(user) {
  return !isProductInventoryRestrictedUser(user);
}

export function canDeleteProducts(user) {
  return !isProductInventoryRestrictedUser(user);
}

export function canManageCatalog(user) {
  const uid = getUserUuid(user);
  if (PRODUCT_CATALOG_OVERRIDE_USERS.has(uid)) return true;
  return !isProductInventoryRestrictedUser(user);
}

const ZERO_STOCK_RESET_ROUTE = '/zero-stock-location';
const ZERO_STOCK_RESET_USER = '1b5e098e-1206-447e-b4bc-6d009b85b5d3';
const USER_ACTIVITY_ROUTE = '/user-activity';
const DATABASE_BACKUP_ROUTE = '/database-backup';
const USER_ACCESS_ROUTE = '/user-access';
const CUSTOMER_PRIVATE_BALANCES_ROUTE = '/customer-private-balances';
const USER_ACTIVITY_EMAIL = 'alielboussi00@gmail.com';
const STOCK_CONTROL_EMAIL = 'alielboussi00@gmail.com';
const STOCKTAKE_AGGREGATION_ROUTE = '/stocktake/aggregation';
const LUSAKA_STOCK_ROUTE = '/lusaka-stock';
const STOCKTAKE_FLOW_ROUTES = new Set([
  '/stocktake',
  '/stocktake-periods',
]);
const STOCK_CONTROL_ROUTES = new Set([
  // legacy routes kept blocked except for stock-control email if still bookmarked
  '/stock-periods',
  '/stock-count',
]);
const COMPANY_SETTINGS_ROUTE = '/company-settings';

export function canViewStockControl(user) {
  return getUserEmail(user) === STOCK_CONTROL_EMAIL;
}

export function canViewStocktakeAggregation(user) {
  return getUserEmail(user) === STOCK_CONTROL_EMAIL;
}

export function isHassanAwadUser(user) {
  const email = getUserEmail(user);
  if (HASSAN_AWAD.emails.some((entry) => entry.toLowerCase() === email)) return true;
  return getUserUuid(user) === String(HASSAN_AWAD.id).toLowerCase();
}

export function isQuotationerOnlyUser(user) {
  return isHassanAwadUser(user);
}

export function canViewStocktakeFlow(user) {
  if (!user) return false;
  if (isQuotationerOnlyUser(user)) return false;
  return true;
}

export function canDeleteQuotationData(user) {
  return !isQuotationerOnlyUser(user);
}

export function isQuotationConverted(quote) {
  if (!quote) return false;
  const status = String(quote.status || '').toLowerCase();
  return status === 'converted'
    || status === 'invoice'
    || Boolean(quote.sale_id)
    || Boolean(quote.layby_id);
}

/** Whether a quotation may be edited in the UI / saved again. */
export function canEditQuotation(user, quote, { hasOutstandingDue = true } = {}) {
  if (!quote || !quote.id) return true;
  if (isQuotationConverted(quote) && !hasOutstandingDue) return false;
  return true;
}

export function canEditSavedQuote(user, quote = null, options = {}) {
  if (quote) return canEditQuotation(user, quote, options);
  return !isQuotationerOnlyUser(user);
}

export function canManageLaybys(user) {
  return !isQuotationerOnlyUser(user);
}

export function shouldHideAppChrome() {
  return false;
}

export function getHomeDashboardPath(user) {
  return isHassanAwadUser(user) ? HASSAN_AWAD.landingPath : '/dashboard';
}

export function canViewUserActivity(user) {
  return getUserEmail(user) === USER_ACTIVITY_EMAIL;
}

export function canViewDatabaseBackup(user) {
  return getUserEmail(user) === USER_ACTIVITY_EMAIL;
}

export function canManageLoginAccess(user) {
  return getUserEmail(user) === USER_ACTIVITY_EMAIL;
}

const CUSTOMER_PRIVATE_BALANCES_EMAILS = new Set([
  'alielboussi00@gmail.com',
  'hassanboussi2000@gmail.com',
  'hassanawad18@gmail.com',
]);

export function canViewCustomerPrivateBalances(user) {
  return CUSTOMER_PRIVATE_BALANCES_EMAILS.has(getUserEmail(user));
}

export function allowedPathsForUser(user) {
  const uuid = getUserUuid(user);
  const email = getUserEmail(user);
  const allow = EMAIL_ROUTE_ALLOWLIST.get(email) || ROUTE_ALLOWLIST.get(uuid);
  // Default: allow everything for users not explicitly listed
  const list = allow || ['*'];
  // Expand allowlist with alias counterparts so AccessGuard won't redirect when locked variant is used
  // e.g., if '/stock-report-mobile' is allowed, also allow '/stock-report-mobile-locked'
  if (Array.isArray(list) && list.includes('/stock-report-mobile') && !list.includes('/stock-report-mobile-locked')) {
    return [...list, '/stock-report-mobile-locked'];
  }
  return list;
}

export function isPathAllowed(user, path) {
  const allow = allowedPathsForUser(user);
  // Normalize and alias the incoming path to its canonical base
  const p = normalizePath(path || '/');
  const uid = getUserUuid(user);
  if (p === ZERO_STOCK_RESET_ROUTE && uid !== ZERO_STOCK_RESET_USER) return false;
  if (p === COMPANY_SETTINGS_ROUTE || p.startsWith(`${COMPANY_SETTINGS_ROUTE}/`)) return false;
  if (p === USER_ACTIVITY_ROUTE || p.startsWith(`${USER_ACTIVITY_ROUTE}/`)) {
    return canViewUserActivity(user);
  }
  if (p === DATABASE_BACKUP_ROUTE || p.startsWith(`${DATABASE_BACKUP_ROUTE}/`)) {
    return canViewDatabaseBackup(user);
  }
  if (p === USER_ACCESS_ROUTE || p.startsWith(`${USER_ACCESS_ROUTE}/`)) {
    return canManageLoginAccess(user);
  }
  if (p === CUSTOMER_PRIVATE_BALANCES_ROUTE || p.startsWith(`${CUSTOMER_PRIVATE_BALANCES_ROUTE}/`)) {
    return canViewCustomerPrivateBalances(user);
  }
  if (p === STOCKTAKE_AGGREGATION_ROUTE || p.startsWith(`${STOCKTAKE_AGGREGATION_ROUTE}/`)) {
    return canViewStocktakeAggregation(user);
  }
  // Hidden kiosk page — direct URL only, any logged-in user.
  if (p === LUSAKA_STOCK_ROUTE) return Boolean(user && (user.id || user.email));
  if (STOCK_CONTROL_ROUTES.has(p) && !canViewStockControl(user)) {
    return false;
  }
  if ((STOCKTAKE_FLOW_ROUTES.has(p) || p.startsWith('/stocktake/')) && !canViewStocktakeFlow(user)) {
    return false;
  }
  if (allow.includes('*')) return true;
  return allow.some(base => p === base || p.startsWith(base + '/') );
}

// Return the first allowed base path for a user. If '*' (full access), default to dashboard.
export function getFirstAllowedPath(user) {
  const home = getHomeDashboardPath(user);
  if (isPathAllowed(user, home)) return home;
  const allow = allowedPathsForUser(user);
  if (!allow || allow.length === 0) return '/dashboard';
  if (allow.includes('*')) return '/dashboard';
  return allow[0] || '/dashboard';
}

// Given a preferred path, return it if allowed; otherwise return the first allowed path.
export function getFallbackPathForUser(user, preferredPath) {
  // Honor the caller's preferred path if it's allowed (after alias normalization)
  if (preferredPath && isPathAllowed(user, preferredPath)) return preferredPath;
  return getFirstAllowedPath(user);
}

// Optional per-user landing page override (always land here after login)
const PREFERRED_LANDING_PATH = new Map([
  // Always land on dashboard for this user
  ['1b5e098e-1206-447e-b4bc-6d009b85b5d3', '/dashboard'],
  ['99a0cdc5-1e67-40ff-93d4-a961cb9cff39', '/dashboard'],
  ['148d3357-0c7f-4600-99fa-6056c09e4014', '/dashboard'],
  ['44f085ee-8ade-4da4-9b2f-d39fd0a34179', '/dashboard'],
  [HASSAN_AWAD.id, HASSAN_AWAD.landingPath],
]);

const PREFERRED_LANDING_PATH_BY_EMAIL = new Map([
  ['husseinelboussizam@gmail.com', '/dashboard'],
  [HASSAN_AWAD.emails[0], HASSAN_AWAD.landingPath],
]);

export function getPreferredLandingPath(user) {
  const email = getUserEmail(user);
  if (email && PREFERRED_LANDING_PATH_BY_EMAIL.has(email)) {
    return PREFERRED_LANDING_PATH_BY_EMAIL.get(email);
  }
  const uuid = getUserUuid(user);
  return PREFERRED_LANDING_PATH.get(uuid) || null;
}

// Utility to identify if Stock Report location must be locked
export function shouldLockStockReportLocation(user) {
  return Boolean(getLockedLocationIdForUser(user));
}

// If the user should be locked to a specific Stock Report location, return its UUID; else null
export function getLockedLocationIdForUser(user) {
  const uuid = getUserUuid(user);
  return LOCKED_LOCATION_BY_USER.get(uuid) || null;
}

// Map of user UUID -> locked location UUID for Stock Report Mobile
const LOCKED_LOCATION_BY_USER = new Map([
  [HASSAN_AWAD.id, HASSAN_AWAD.lockedStockReportLocationId],
]);

/**
 * Build the local session user from Firebase Auth identity using hardcoded UUID/email maps only.
 * Call after password login, Google OAuth, or auth-profile API.
 */
export function resolveSessionUserFromAuth(input = {}) {
  const email = String(input.email || '').trim().toLowerCase();
  const authId = String(input.id || '').trim().toLowerCase();
  const metadata = input.user_metadata || input.metadata || {};
  const canonicalId = AUTH_EMAIL_TO_CANONICAL_USER_ID.get(email)
    || (isUserUuid(authId) ? authId : null);
  const sessionId = canonicalId || authId || null;
  const displayName = String(
    input.full_name
    || metadata.full_name
    || metadata.name
    || metadata.display_name
    || (canonicalId ? USER_DISPLAY_NAMES.get(canonicalId) : '')
    || (email ? email.split('@')[0] : 'User'),
  ).trim() || 'User';

  return {
    id: sessionId || email,
    user_uid: isUserUuid(sessionId) ? sessionId : null,
    user_id: null,
    email,
    full_name: displayName,
    role: 'user',
  };
}
