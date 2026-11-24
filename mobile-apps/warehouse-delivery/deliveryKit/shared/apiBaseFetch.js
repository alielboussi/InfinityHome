/**
 * Android 4G often fails DNS for one hostname (UnknownHostException)
 * while another alias still resolves. Try the configured API host, then aliases.
 */

const FALLBACK_BASES = [
  'https://www.infinity-home.online',
  'https://infinity-home.online',
  'https://infinity-home-pi.vercel.app',
];

export function listApiBases(primary) {
  const out = [];
  const add = (value) => {
    const base = String(value || '').trim().replace(/\/+$/, '');
    if (base && !out.includes(base)) out.push(base);
  };
  add(primary);
  FALLBACK_BASES.forEach(add);
  return out;
}

export function isDnsOrNetworkFetchError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('unknownhost')
    || msg.includes('unable to resolve host')
    || msg.includes('no address associated')
    || msg.includes('failed to fetch')
    || msg.includes('network request failed')
    || msg.includes('nameresolution')
    || msg.includes('enotfound');
}

function friendlyDnsError(cause) {
  const err = new Error(
    'Cannot reach the server (DNS). Switch Wi-Fi or mobile data, then try again.',
  );
  err.network = true;
  err.cause = cause;
  return err;
}

export async function fetchWithApiBaseFallback(apiPath, init, primaryBase) {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const bases = listApiBases(primaryBase);
  let lastErr;
  for (let i = 0; i < bases.length; i += 1) {
    try {
      return await fetch(`${bases[i]}${path}`, init);
    } catch (err) {
      lastErr = err;
      if (!isDnsOrNetworkFetchError(err)) throw err;
    }
  }
  throw friendlyDnsError(lastErr);
}
