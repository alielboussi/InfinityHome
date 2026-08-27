// Consolidated admin serverless dispatcher.
// Routes multiple legacy handlers through a single API function while preserving behavior via rewrites.

const HANDLER_LOADERS = {
  'factory-production-approve': () => import('../server/handlers/factory-production-approve.js'),
  'inventory-bulk': () => import('../server/handlers/inventory-bulk.js'),
  'product-locations': () => import('../server/handlers/product-locations.js'),
  'products-bulk-delete': () => import('../server/handlers/products-bulk-delete.js'),
  'pos-catalog': () => import('../server/handlers/pos-catalog.js'),
  'quotation-read': () => import('../server/handlers/quotation-read.js'),
  'quotation-save': () => import('../server/handlers/quotation-save.js'),
  'quote-convert-layby': () => import('../server/handlers/quote-convert-layby.js'),
  'sales-edit': () => import('../server/handlers/sales-edit.js'),
  'sales-adjustment': () => import('../server/handlers/sales-adjustment.js'),
  'user-activity': () => import('../server/handlers/user-activity.js'),
  'login-access': () => import('../server/handlers/login-access.js'),
  'db-backup': () => import('../server/handlers/db-backup.js'),
  'shop-catalog': () => import('../server/handlers/shop-catalog.js'),
  'web-orders': () => import('../server/handlers/web-orders.js'),
  'product-image-search': () => import('../server/handlers/product-image-search.js'),
};

function resolveHandler(mod) {
  const visited = new Set();
  function walk(node, depth = 0) {
    if (!node || depth > 4) return null;
    if (typeof node === 'function') return node;
    if (typeof node !== 'object') return null;
    if (visited.has(node)) return null;
    visited.add(node);

    const priorityKeys = ['default', 'handler', 'module.exports'];
    for (const key of priorityKeys) {
      const found = walk(node?.[key], depth + 1);
      if (found) return found;
    }

    for (const value of Object.values(node)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }

    return null;
  }

  return walk(mod);
}

function resolveAdminAction(req) {
  return String(
    req.query?.adminAction ||
      req.query?.admin_action ||
      req.body?.adminAction ||
      req.body?.admin_action ||
      ''
  )
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vercel-protection-bypass');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const adminAction = resolveAdminAction(req);
  if (!adminAction) {
    res.status(400).json({
      ok: false,
      error: 'Missing adminAction',
      available: Object.keys(HANDLER_LOADERS),
    });
    return;
  }

  const loadHandler = HANDLER_LOADERS[adminAction];
  if (!loadHandler) {
    res.status(404).json({
      ok: false,
      error: `Unknown adminAction: ${adminAction}`,
      available: Object.keys(HANDLER_LOADERS),
    });
    return;
  }

  try {
    const mod = await loadHandler();
    const delegated = resolveHandler(mod);
    if (typeof delegated !== 'function') {
      res.status(500).json({
        ok: false,
        error: `Handler module for ${adminAction} has no callable export`,
        exports: mod ? Object.keys(mod) : [],
      });
      return;
    }
    await delegated(req, res);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Unexpected dispatcher error',
      adminAction,
    });
  }
}
