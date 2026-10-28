function entryReceived(entry) {
  return Boolean(entry?.metadata?.received_at);
}

/**
 * Cancel a submitted delivery before Hassan accepts any packets.
 * Does not adjust warehouse stock (stock moves only on accept).
 */
export async function cancelWarehouseDeliveryServer(sb, sessionId, { cancelledByEmail, reason } = {}) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('session_id is required');

  const { data: session, error: sessErr } = await sb
    .from('warehouse_delivery_sessions')
    .select('*')
    .eq('id', sid)
    .maybeSingle();
  if (sessErr) throw new Error(sessErr.message || 'Failed to load delivery');
  if (!session) throw new Error('Delivery session not found.');

  const status = String(session.status || '').toLowerCase();
  if (status === 'cancelled') {
    return { ok: true, session_id: sid, delivery_number: session.delivery_number, already_cancelled: true };
  }
  if (status === 'completed') {
    throw new Error('Completed deliveries cannot be cancelled.');
  }

  const { data: entries, error: entErr } = await sb
    .from('warehouse_delivery_entries')
    .select('id, metadata')
    .eq('session_id', sid);
  if (entErr) throw new Error(entErr.message || 'Failed to load delivery lines');

  const received = (entries || []).some(entryReceived);
  if (received) {
    throw new Error('Cannot cancel: some packets were already received (stock may have moved).');
  }

  if (status !== 'submitted' && status !== 'pending' && status !== 'draft' && status !== 'partially_received') {
    throw new Error(`Delivery status "${session.status}" cannot be cancelled.`);
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb.from('warehouse_delivery_sessions').update({
    status: 'cancelled',
    metadata: {
      ...(session.metadata || {}),
      hassan_alert_pending: false,
      cancelled_at: now,
      cancelled_by_email: cancelledByEmail || null,
      cancel_reason: String(reason || '').trim() || null,
    },
  }).eq('id', sid);
  if (updErr) throw new Error(updErr.message || 'Failed to cancel delivery');

  return {
    ok: true,
    session_id: sid,
    delivery_number: session.delivery_number,
    stock_unchanged: true,
  };
}

export async function findWarehouseDeliverySessionByNumber(sb, deliveryNumber) {
  const num = String(deliveryNumber || '').trim();
  if (!num) return null;
  const { data } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status')
    .eq('delivery_number', num)
    .maybeSingle();
  return data || null;
}
