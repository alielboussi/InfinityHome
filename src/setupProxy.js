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

module.exports = function setupProxy(app) {
  mountLocalNotify(app);
  mountLocalStocktake(app);

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
        return !WHATSAPP_NOTIFY_PATHS.has(pathOnly);
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
