import { useEffect, useState } from 'react';
import {
  fetchDeliveryDriversCached,
  getDeliveryDriversCacheSync,
  loadPersistedDeliveryDrivers,
  subscribeDeliveryDrivers,
} from '../lib/deliveryDriversStore';
import { sortDeliveryDriversByName } from '../deliveryKit/lib/sortDeliveryDrivers';

export function useDeliveryDrivers() {
  const [drivers, setDrivers] = useState(() => getDeliveryDriversCacheSync() || []);
  const [loading, setLoading] = useState(() => !drivers.length);

  useEffect(() => {
    let alive = true;
    const unsub = subscribeDeliveryDrivers((list) => {
      if (alive) {
        setDrivers(list);
        if (list.length) setLoading(false);
      }
    });

    (async () => {
      if (!getDeliveryDriversCacheSync()?.length) {
        const persisted = await loadPersistedDeliveryDrivers();
        if (alive && persisted?.length) {
          setDrivers(sortDeliveryDriversByName(persisted));
          setLoading(false);
        }
      }
      try {
        await fetchDeliveryDriversCached();
      } catch {
        // keep cached / persisted list
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return { drivers, loading };
}
