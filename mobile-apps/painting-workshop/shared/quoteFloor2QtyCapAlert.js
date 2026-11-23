import { Alert } from 'react-native';

/** Show when server capped ready qty to Floor 2 on-hand. */
export function alertQuoteFloor2QtyCappedIfNeeded(result, { tUi, locale }) {
  if (!result?.floor2_qty_capped) return;
  const requested = Math.max(0, Number(result.requested_ready_qty) || 0);
  const started = Math.max(0, Number(result.ready_qty) || 0);
  if (started >= requested) return;
  const body = (tUi('quoteFloor2QtyCappedBody', locale) || '')
    .replace('{requested}', String(requested))
    .replace('{started}', String(started))
    .replace('{short}', String(requested - started));
  Alert.alert(
    tUi('quoteFloor2QtyCappedTitle', locale) || 'Floor 2 stock limit',
    body || `You asked for ${requested} but only ${started} were started (Floor 2 stock). Tap the line again when more stock is on Floor 2.`,
  );
}