import { Platform } from 'react-native';

let Zeroconf = null;
try {
  // eslint-disable-next-line global-require
  Zeroconf = require('react-native-zeroconf').default || require('react-native-zeroconf');
} catch {
  Zeroconf = null;
}

const SCAN_MS = 6000;

function serviceKey(service) {
  const host = service?.addresses?.[0] || service?.host || '';
  const port = service?.port || 0;
  const name = service?.name || service?.fullname || 'Printer';
  return `${name}|${host}|${port}`;
}

/**
 * Browse mDNS for IPP / printer services on the LAN (requires native build with multicast).
 * @returns {Promise<Array<{ id: string, name: string, host: string, port: number }>>}
 */
export function discoverNetworkPrinters() {
  if (!Zeroconf || Platform.OS !== 'android') {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const found = new Map();
    const zc = new Zeroconf();

    const finish = () => {
      try {
        zc.stop();
        zc.removeAllListeners?.();
      } catch {
        // ignore
      }
      resolve([...found.values()]);
    };

    const onResolved = (service) => {
      const host = service?.addresses?.[0] || service?.host;
      if (!host) return;
      const name = String(service?.name || service?.fullname || host).trim();
      const port = Number(service?.port) || 631;
      const row = {
        id: serviceKey(service),
        name,
        host,
        port,
      };
      found.set(row.id, row);
    };

    zc.on('resolved', onResolved);
    zc.on('error', () => {});

    try {
      zc.scan('ipp', 'tcp', 'local.');
      zc.scan('printer', 'tcp', 'local.');
    } catch {
      finish();
      return;
    }

    setTimeout(finish, SCAN_MS);
  });
}

export function isPrinterDiscoveryAvailable() {
  return Boolean(Zeroconf && Platform.OS === 'android');
}
