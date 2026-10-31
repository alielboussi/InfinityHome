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

/** Remove draft/cancelled sessions with no received stock (Factory→Kitwe retries). */
export async function deleteWarehouseDeliverySessionHard(sb, sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('session_id is required');

  const { data: session, error: sessErr } = await sb
    .from('warehouse_delivery_sessions')
    .select('id, delivery_number, status')
    .eq('id', sid)
    .maybeSingle();
  if (sessErr) throw new Error(sessErr.message || 'Failed to load delivery');
  if (!session) throw new Error('Delivery session not found.');

  const status = String(session.status || '').toLowerCase();
  if (status !== 'draft' && status !== 'cancelled') {
    throw new Error(`Only draft or cancelled deliveries can be deleted (status: ${session.status}).`);
  }

  const { data: entries, error: entErr } = await sb
    .from('warehouse_delivery_entries')
    .select('id, metadata')
    .eq('session_id', sid);
  if (entErr) throw new Error(entErr.message || 'Failed to load delivery lines');

  if ((entries || []).some(entryReceived)) {
    throw new Error('Cannot delete: some lines were already received at Kitwe.');
  }

  for (const line of entries || []) {
    if (line?.id) {
      const { error } = await sb.from('warehouse_delivery_entries').delete().eq('id', line.id);
      if (error) throw new Error(error.message || 'Failed to delete delivery line');
    }
  }

  const { data: events } = await sb
    .from('warehouse_delivery_events')
    .select('id')
    .eq('session_id', sid);
  for (const ev of events || []) {
    if (ev?.id) {
      await sb.from('warehouse_delivery_events').delete().eq('id', ev.id);
    }
  }

  const { error: delErr } = await sb.from('warehouse_delivery_sessions').delete().eq('id', sid);
  if (delErr) throw new Error(delErr.message || 'Failed to delete delivery session');

  return {
    ok: true,
    session_id: sid,
    delivery_number: session.delivery_number,
    deleted_status: status,
  };
}
