// Proxy /api calls in CRA dev to a remote serverless host (e.g., Vercel)
// WhatsApp notify routes run locally so new actions work before deploy.
// Usage:
//   - Set REACT_APP_API_BASE to your deployed host, e.g. https://infinity-home-pi.vercel.app
//   - Put Wasender / WhatsApp env vars in .env.local for local notify sends

const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), override: true }); } catch {}
try { require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), override: false }); } catch {}

const WHATSAPP_NOTIFY_PATHS = new Set([
  '/api/notify',
  '/api/whatsapp-labels',
  '/api/whatsapp-sale',
  '/api/whatsapp-layby',
  '/api/whatsapp-transfer',
  '/api/whatsapp-lusaka-transfer',
  '/api/monthly-balance-dues',
  '/api/monthly-balance-send',
  // Some proxy versions pass pathname without /api prefix.
  '/notify',
  '/whatsapp-labels',
  '/whatsapp-sale',
  '/whatsapp-layby',
  '/whatsapp-transfer',
  '/whatsapp-lusaka-transfer',
  '/monthly-balance-dues',
  '/monthly-balance-send',
]);

const STOCKTAKE_API_PATHS = new Set([
  '/api/stocktake',
  '/api/stocktake-login',
  '/api/auth-profile',
  '/api/stocktake-locations',
  '/api/stocktake-location-state',
  '/api/stocktake-catalog',
  '/api/stocktake-events-list',
  '/api/stocktake-open-sessions',
  '/api/stocktake-event-get',
  '/api/stocktake-event-create',
  '/api/stocktake-event-set-gate',
  '/api/stocktake-count-add',
  '/api/stocktake-count-mine',
  '/api/stocktake-count-remove-mine',
  '/api/stocktake-count-clear-mine',
  '/api/stocktake-counts-import',
  '/api/stocktake-counts-clear',
  '/api/stocktake-import-template',
  '/api/stocktake-set-scan',
  '/api/stocktake-product-create',
  '/api/stocktake-set-create',
  '/api/stocktake-event-submit',
  '/api/stocktake-event-cancel',
  '/api/stocktake-periods-list',
  '/api/stocktake-period-detail',
  '/api/stocktake-period-variance',
]);

const LOCAL_API_PATHS = new Set([
  ...WHATSAPP_NOTIFY_PATHS,
  ...STOCKTAKE_API_PATHS,
  '/api/user-activity',
  '/api/login-access',
  '/api/checkout',
  '/api/transactions',
  '/api/payments',
  '/api/payments-list',
  '/api/payments-delete',
  '/api/layby-statement',
  '/api/layby-payments-delete',
  '/api/layby-delete-customer',
  '/api/product-locations',
]);

const WHATSAPP_PATH_ACTION = {
  '/api/whatsapp-labels': 'whatsapp-labels',
  '/api/whatsapp-sale': 'whatsapp-sale',
  '/api/whatsapp-layby': 'whatsapp-layby',
  '/api/whatsapp-transfer': 'whatsapp-transfer',
  '/api/whatsapp-lusaka-transfer': 'whatsapp-lusaka-transfer',
  '/api/monthly-balance-dues': 'monthly-balance-dues',
  '/api/monthly-balance-send': 'monthly-balance-send',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function attachNotifyAction(req, fixedAction) {
  if (!req.query || typeof req.query !== 'object') req.query = {};

  if (fixedAction) {
    req.query.action = fixedAction;
  } else {
    const rawUrl = String(req.originalUrl || req.url || '');
    const qIndex = rawUrl.indexOf('?');
    if (qIndex >= 0 && !req.query.action) {
      try {
        const params = new URLSearchParams(rawUrl.slice(qIndex + 1));
        const action = params.get('action') || params.get('a');
        if (action) req.query.action = action;
      } catch (_) {
        // ignore malformed query
      }
    }
  }

  const action = fixedAction || req.query.action;
  if (action) {
    req.body = { ...(req.body || {}), action };
  }
}

function mountLocalNotify(app) {
  let notifyHandler;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    notifyHandler = require('../api/notify.js');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[proxy] Could not load local api/notify.js:', error?.message || error);
    return;
  }

  const handleNotify = async (req, res, fixedAction) => {
    if (req.method === 'GET' && !fixedAction) {
      res.status(405).json({ ok: false, stage: 'method', error: 'Method Not Allowed' });
      return;
    }
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      res.status(405).json({ ok: false, stage: 'method', error: 'Method Not Allowed' });
      return;
    }

    try {
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      attachNotifyAction(req, fixedAction);
      await notifyHandler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, stage: 'notify', error: error?.message || String(error) });
      }
    }
  };

  app.post('/api/notify', (req, res) => { handleNotify(req, res); });
  app.options('/api/notify', (req, res) => { handleNotify(req, res); });
  Object.entries(WHATSAPP_PATH_ACTION).forEach(([route, action]) => {
    app.post(route, (req, res) => { handleNotify(req, res, action); });
    app.options(route, (req, res) => { handleNotify(req, res, action); });
  });

  // eslint-disable-next-line no-console
  console.log('[proxy] Local /api/notify and /api/whatsapp-* handlers enabled.');
}

function mountLocalStocktake(app) {
  let stocktakeHandlerPromise = null;

  const loadStocktakeHandler = () => {
    if (!stocktakeHandlerPromise) {
      stocktakeHandlerPromise = import('../api/stocktake.js')
        .then((mod) => mod.default || mod)
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('[proxy] Could not load local api/stocktake.js:', error?.message || error);
          return null;
        });
    }
    return stocktakeHandlerPromise;
  };

  const handleStocktake = async (req, res) => {
    try {
      const stocktakeHandler = await loadStocktakeHandler();
      if (!stocktakeHandler) {
        res.status(503).json({ ok: false, error: 'Local stocktake API unavailable' });
        return;
      }
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      attachNotifyAction(req);
      await stocktakeHandler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, stage: 'stocktake', error: error?.message || String(error) });
      }
    }
  };

  app.get('/api/stocktake', (req, res) => { handleStocktake(req, res); });
  app.post('/api/stocktake', (req, res) => { handleStocktake(req, res); });
  app.options('/api/stocktake', (req, res) => { handleStocktake(req, res); });

  const STOCKTAKE_REWRITE_ROUTES = [
    'stocktake-login',
    'auth-profile',
    'stocktake-locations',
    'stocktake-location-state',
    'stocktake-catalog',
    'stocktake-events-list',
    'stocktake-open-sessions',
    'stocktake-event-get',
    'stocktake-event-create',
    'stocktake-event-set-gate',
    'stocktake-count-add',
    'stocktake-count-mine',
    'stocktake-count-remove-mine',
    'stocktake-count-clear-mine',
    'stocktake-counts-import',
    'stocktake-counts-clear',
    'stocktake-import-template',
    'stocktake-set-scan',
    'stocktake-product-create',
    'stocktake-set-create',
    'stocktake-event-submit',
    'stocktake-event-cancel',
    'stocktake-periods-list',
    'stocktake-period-detail',
    'stocktake-period-variance',
  ];

  STOCKTAKE_REWRITE_ROUTES.forEach((route) => {
    const action = route.startsWith('stocktake-') ? route.slice('stocktake-'.length) : route;
    const fixedAction = action === 'login' ? 'login' : action;
    app.get(`/api/${route}`, (req, res) => {
      req.query = { ...(req.query || {}), action: fixedAction };
      handleStocktake(req, res);
    });
    app.post(`/api/${route}`, (req, res) => {
      req.query = { ...(req.query || {}), action: fixedAction };
      handleStocktake(req, res);
    });
    app.options(`/api/${route}`, (req, res) => {
      req.query = { ...(req.query || {}), action: fixedAction };
      handleStocktake(req, res);
    });
  });

  // eslint-disable-next-line no-console
  console.log('[proxy] Local /api/stocktake* handlers enabled.');
}

function mountLocalLabels(app) {
  let labelsHandlerPromise = null;

  const loadLabelsHandler = () => {
    if (!labelsHandlerPromise) {
      labelsHandlerPromise = import('../api/labels.js')
        .then((mod) => mod.default || mod)
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('[proxy] Could not load local api/labels.js:', error?.message || error);
          return null;
        });
    }
    return labelsHandlerPromise;
  };

  const handleLabels = async (req, res) => {
    try {
      const labelsHandler = await loadLabelsHandler();
      if (!labelsHandler) {
        res.status(503).json({ ok: false, error: 'Local labels API unavailable' });
        return;
      }
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      await labelsHandler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, stage: 'labels', error: error?.message || String(error) });
      }
    }
  };

  app.get('/api/labels', handleLabels);
  app.post('/api/labels', handleLabels);
  app.options('/api/labels', handleLabels);
  app.get('/api/label-print-job', (req, res) => {
    req.query = { ...(req.query || {}), action: 'job' };
    handleLabels(req, res);
  });
  app.post('/api/label-print-job', (req, res) => {
    req.query = { ...(req.query || {}), action: 'job' };
    handleLabels(req, res);
  });
  app.get('/api/label-print-history', (req, res) => {
    req.query = { ...(req.query || {}), action: 'history' };
    handleLabels(req, res);
  });

  // eslint-disable-next-line no-console
  console.log('[proxy] Local /api/labels handlers enabled.');
}

function mountLocalUserActivity(app) {
  let handlerPromise = null;

  const loadHandler = () => {
    if (!handlerPromise) {
      handlerPromise = import('../server/handlers/user-activity.js')
        .then((mod) => mod.default || mod)
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('[proxy] Could not load local user-activity handler:', error?.message || error);
          return null;
        });
    }
    return handlerPromise;
  };

  const handleUserActivity = async (req, res) => {
    try {
      const handler = await loadHandler();
      if (!handler) {
        res.status(503).json({ ok: false, error: 'Local user-activity API unavailable' });
        return;
      }
      if ((req.method === 'POST' || req.method === 'DELETE') && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      await handler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: error?.message || String(error) });
      }
    }
  };

  app.get('/api/user-activity', handleUserActivity);
  app.post('/api/user-activity', handleUserActivity);
  app.delete('/api/user-activity', handleUserActivity);
  app.options('/api/user-activity', handleUserActivity);

  // eslint-disable-next-line no-console
  console.log('[proxy] Local /api/user-activity handler enabled (Firebase token support).');
}

function mountLocalLoginAccess(app) {
  let handlerPromise = null;

  const loadHandler = () => {
    if (!handlerPromise) {
      handlerPromise = import('../server/handlers/login-access.js')
        .then((mod) => mod.default || mod)
        .catch((error) => {
          console.warn('[proxy] Could not load local login-access handler:', error?.message || error);
          return null;
        });
    }
    return handlerPromise;
  };

  const handleLoginAccess = async (req, res) => {
    try {
      const handler = await loadHandler();
      if (!handler) {
        res.status(503).json({ ok: false, error: 'Local login-access API unavailable' });
        return;
      }
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      await handler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: error?.message || String(error) });
      }
    }
  };

  app.get('/api/login-access', handleLoginAccess);
  app.post('/api/login-access', handleLoginAccess);
  app.options('/api/login-access', handleLoginAccess);

  console.log('[proxy] Local /api/login-access handler enabled (Firebase token support).');
}

function mountLocalApiHandler(app, route, modulePath, label, fixedAction) {
  let handlerPromise = null;
  const loadHandler = () => {
    if (!handlerPromise) {
      handlerPromise = import(modulePath)
        .then((mod) => mod.default || mod)
        .catch((error) => {
          console.warn(`[proxy] Could not load local ${label}:`, error?.message || error);
          return null;
        });
    }
    return handlerPromise;
  };

  const handle = async (req, res) => {
    try {
      const handler = await loadHandler();
      if (!handler) {
        res.status(503).json({ ok: false, error: `Local ${label} unavailable` });
        return;
      }
      if (fixedAction) {
        req.query = { ...(req.query || {}), action: fixedAction };
      }
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      await handler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: error?.message || String(error) });
      }
    }
  };

  app.post(route, handle);
  app.options(route, handle);
  console.log(`[proxy] Local ${route} handler enabled.`);
}

function mountLocalProductLocations(app) {
  let handlerPromise = null;
  const loadHandler = () => {
    if (!handlerPromise) {
      handlerPromise = import('../server/handlers/product-locations.js')
        .then((mod) => mod.default || mod)
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('[proxy] Could not load local product-locations handler:', error?.message || error);
          return null;
        });
    }
    return handlerPromise;
  };

  const handle = async (req, res) => {
    try {
      const handler = await loadHandler();
      if (!handler) {
        res.status(503).json({ ok: false, error: 'Local product-locations API unavailable' });
        return;
      }
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object')) {
        req.body = await readJsonBody(req);
      }
      await handler(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: error?.message || String(error) });
      }
    }
  };

  app.get('/api/product-locations', handle);
  app.post('/api/product-locations', handle);
  app.options('/api/product-locations', handle);

  // eslint-disable-next-line no-console
  console.log('[proxy] Local /api/product-locations handler enabled.');
}

function mountLocalCheckout(app) {
  mountLocalApiHandler(app, '/api/checkout', '../api/checkout.js', 'checkout API');
}

function mountLocalTransactions(app) {
  const routes = {
    '/api/transactions': null,
    '/api/payments': 'payments',
    '/api/payments-list': 'payments-list',
    '/api/payments-delete': 'payments-delete',
    '/api/layby-statement': 'layby-statement',
    '/api/layby-payments-delete': 'layby-payments-delete',
    '/api/layby-delete-customer': 'layby-delete-customer',
  };
  Object.entries(routes).forEach(([route, action]) => {
    mountLocalApiHandler(app, route, '../api/transactions.js', 'transactions API', action);
  });
}

module.exports = function setupProxy(app) {
  mountLocalNotify(app);
  mountLocalStocktake(app);
  mountLocalLabels(app);
  mountLocalUserActivity(app);
  mountLocalLoginAccess(app);
  mountLocalCheckout(app);
  mountLocalTransactions(app);
  mountLocalProductLocations(app);

  const target = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  if (!target) {
    // eslint-disable-next-line no-console
    console.log('[proxy] REACT_APP_API_BASE not set; other /api/* routes are not proxied in dev.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[proxy] Proxying other /api/* routes to ${target}`);

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      proxyTimeout: 15000,
      timeout: 15000,
      filter: (pathname) => {
        const pathOnly = String(pathname || '').split('?')[0];
        return !LOCAL_API_PATHS.has(pathOnly);
      },
      onProxyReq: (proxyReq) => {
        const bypass = process.env.REACT_APP_VERCEL_BYPASS && process.env.REACT_APP_VERCEL_BYPASS.trim();
        if (bypass) {
          proxyReq.setHeader('x-vercel-protection-bypass', bypass);
        }
      },
      logLevel: 'warn',
    })
  );
};
