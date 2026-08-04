import React from 'react';
import db from '../dataClient';
import { isRealtimeEnabled } from '../utils/realtimeConfig';

/**
 * Subscribe to Firestore realtime for a set of tables and emit a debounced tick
 * whenever any change happens. Use the returned `tick` in effect deps to refetch.
 */
export function useRealtimeRefresh(tables = [], debounceMs = 250, filtersByTable = undefined) {
  const [tick, setTick] = React.useState(0);
  const timerRef = React.useRef(null);
  const [isVisible, setIsVisible] = React.useState(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });

  // Track page visibility and resubscribe only when visible
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  React.useEffect(() => {
    if (!isRealtimeEnabled()) return;
    if (!Array.isArray(tables) || tables.length === 0) return;
    if (!isVisible) return; // don't subscribe when tab is hidden
    const channelName = 'rt-' + tables.join(',') + (filtersByTable ? ':' + JSON.stringify(filtersByTable) : '');
    const channel = db.channel(channelName);
    tables.forEach((table) => {
      try {
        // Build optional filter string if provided for this table
        let filterStr = null;
        if (filtersByTable && typeof filtersByTable === 'object') {
          const f = filtersByTable[table];
          if (typeof f === 'string' && f.trim()) {
            filterStr = f.trim();
          } else if (f && typeof f === 'object') {
            // Simple equality builder: { column: 'location', value: '<uuid>' }
            const col = f.column || Object.keys(f)[0];
            const val = f.value ?? f[col];
            if (col && (val !== undefined && val !== null && String(val).length > 0)) {
              filterStr = `${col}=eq.${val}`;
            }
          }
        }
        const params = { event: '*', schema: 'public', table };
        if (filterStr) params.filter = filterStr;
        channel.on('firestore_changes', params, () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setTick((t) => t + 1), debounceMs);
        });
      } catch {}
    });
    channel.subscribe();
    return () => {
      try { db.removeChannel(channel); } catch {}
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tables), debounceMs, JSON.stringify(filtersByTable || null), isVisible]);
  return tick;
}

export default useRealtimeRefresh;
