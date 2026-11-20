/**
 * Usage: node mobile-apps/scripts/ensureEasignoreFor.js <app-slug>
 * Example (from app folder): node ../scripts/ensureEasignoreFor.js orders
 */
const path = require('path');
const { ensureAppEasignore } = require('../shared/ensureAppEasignore');
const { MOBILE_APP_SLUGS } = require('../shared/renderEasignoreContent');

const slug = String(process.argv[2] || '').trim();
if (!slug || !MOBILE_APP_SLUGS.includes(slug)) {
  console.error('Usage: node ensureEasignoreFor.js <slug>');
  console.error('Slugs:', MOBILE_APP_SLUGS.join(', '));
  process.exit(1);
}
const appRoot = path.join(__dirname, '..', slug);
ensureAppEasignore(appRoot, slug);