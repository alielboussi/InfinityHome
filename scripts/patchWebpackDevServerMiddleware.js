/**
 * react-scripts 5 still uses webpack-dev-server's deprecated
 * onBeforeSetupMiddleware / onAfterSetupMiddleware. Migrate to setupMiddlewares.
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-scripts',
  'config',
  'webpackDevServer.config.js'
);

const MARKER = 'setupMiddlewares(middlewares, devServer)';

function patchWebpackDevServerConfig() {
  if (!fs.existsSync(configPath)) {
    return { ok: false, reason: 'react-scripts not installed' };
  }

  const source = fs.readFileSync(configPath, 'utf8');
  if (source.includes(MARKER)) {
    return { ok: true, changed: false };
  }
  if (!source.includes('onBeforeSetupMiddleware')) {
    return { ok: true, changed: false, reason: 'unexpected config shape' };
  }

  const next = source.replace(
    /onBeforeSetupMiddleware\(devServer\) \{[\s\S]*?\},\s*onAfterSetupMiddleware\(devServer\) \{[\s\S]*?\},/,
    `setupMiddlewares(middlewares, devServer) {
      // Keep \`evalSourceMapMiddleware\`
      // middlewares before \`redirectServedPath\` otherwise will not have any effect
      // This lets us fetch source contents from webpack for the error overlay
      devServer.app.use(evalSourceMapMiddleware(devServer));

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }

      // Redirect to \`PUBLIC_URL\` or \`homepage\` from \`package.json\` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op' that will reset any
      // previous service worker registered for the same host:port combination.
      // We do this in development to avoid hitting the production cache if
      // it used the same host and port.
      // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));

      return middlewares;
    },`
  );

  if (next === source) {
    return { ok: false, reason: 'patch did not apply' };
  }

  fs.writeFileSync(configPath, next, 'utf8');
  return { ok: true, changed: true };
}

const result = patchWebpackDevServerConfig();
if (result.changed) {
  console.log('[webpack-dev-server] migrated CRA dev middleware to setupMiddlewares');
} else if (result.reason && process.env.npm_lifecycle_event === 'postinstall') {
  console.warn(`[webpack-dev-server] patch skipped: ${result.reason}`);
}
