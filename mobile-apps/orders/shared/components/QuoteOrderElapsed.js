import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { formatQuoteOrderTimer } from '../lib/quoteOrderElapsed';

/** Live quote-order timer with pause-aware ms and Nd / Nmo display. */
export default function QuoteOrderElapsed({ quote, style }) {
  const quoteId = String(quote?.quote_id || '');
  const completed = Boolean(quote?.completed_at);
  const accepted = Boolean(quote?.accepted_at || quote?.run_started_at);
  const isPaused = String(quote?.timer_status || '').toLowerCase() === 'paused' || Boolean(quote?.run_paused_at);
  const shouldTick = accepted && !completed && !isPaused;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shouldTick) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shouldTick, quoteId]);

  if (!accepted) {
    return <Text style={style}>—</Text>;
  }

  return <Text style={style}>{formatQuoteOrderTimer(quote, now)}</Text>;
}
