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
  '/notify',
  '/whatsapp-labels',
  '/whatsapp-sale',
  '/whatsapp-layby',
  '/whatsapp-transfer',
]);

const WHATSAPP_PATH_ACTION = {
  '/api/whatsapp-labels': 'whatsapp-labels',
  '/api/whatsapp-sale': 'whatsapp-sale',
  '/api/whatsapp-layby': 'whatsapp-layby',
  '/api/whatsapp-transfer': 'whatsapp-transfer',
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
      if (fixedAction) {
        req.query = { ...(req.query || {}), action: fixedAction };
        req.body = { ...(req.body || {}), action: fixedAction };
      }
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

module.exports = function setupProxy(app) {
  mountLocalNotify(app);

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
      filter: (pathname) => !WHATSAPP_NOTIFY_PATHS.has(pathname),
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
