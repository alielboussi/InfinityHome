// Proxy /api calls in CRA dev to a remote serverless host (e.g., Vercel)
// This lets localhost use the deployed service-role API for checkout, avoiding client-side RLS issues.
// Usage:
//   - Set REACT_APP_API_BASE to your deployed host, e.g. https://bestrest.vercel.app
//   - Optionally set REACT_APP_FORCE_API=1 to force API-first checkout

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim();
  if (!target) {
    // eslint-disable-next-line no-console
    console.log('[proxy] REACT_APP_API_BASE not set; /api/* will not be proxied in dev.');
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`[proxy] Proxying /api/* to ${target}`);
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      // Fail fast when the remote Vercel API is hung (avoid long CRA 504 waits).
      proxyTimeout: 15000,
      timeout: 15000,
      // Preserve path (e.g., /api/checkout)
      pathRewrite: (path) => path,
      onProxyReq: (proxyReq, req, res) => {
        // If the Vercel deployment has Preview Protection enabled, allow injecting
        // the bypass token from local env to avoid 401s in dev.
        const bypass = process.env.REACT_APP_VERCEL_BYPASS && process.env.REACT_APP_VERCEL_BYPASS.trim();
        if (bypass) {
          proxyReq.setHeader('x-vercel-protection-bypass', bypass);
        }
      },
      logLevel: 'warn',
    })
  );
};
