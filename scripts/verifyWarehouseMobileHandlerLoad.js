/**
 * Production: /api/warehouse-mobile must load on Node ESM (Vercel serverless).
 */
const path = require('path');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.join(__dirname, '..');
  process.chdir(root);
  const entry = pathToFileURL(path.join(root, 'server/handlers/warehouse-mobile.js')).href;
  await import(entry);
  console.log('verifyWarehouseMobileHandlerLoad: ok');
}

main().catch((err) => {
  console.error('[warehouse-mobile-handler:fail]', err?.message || err);
  process.exit(1);
});
