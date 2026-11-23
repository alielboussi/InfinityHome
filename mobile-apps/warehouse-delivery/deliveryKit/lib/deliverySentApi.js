import {
  getLocalSentDelivery,
  listLocalSentDeliveries,
  localSentToDetail,
  localSentToListRow,
  mergeSentLists,
} from './deliverySentLocalStore';
import { warehouseMobileRequest } from '../shared/warehouseMobileApi';

function isUnknownOpError(err) {
  return /unknown op/i.test(String(err?.message || ''));
}

export async function fetchDeliverySentList(limit = 40) {
  const localRows = await listLocalSentDeliveries();
  try {
    const payload = await warehouseMobileRequest('delivery-sent-list', { limit });
    const remote = Array.isArray(payload?.sessions) ? payload.sessions : [];
    return mergeSentLists(remote, localRows, limit);
  } catch (err) {
    if (localRows.length) {
      return localRows.map(localSentToListRow).slice(0, limit);
    }
    if (isUnknownOpError(err)) {
      const apiErr = new Error('delivery_sent_list_not_deployed');
      apiErr.code = 'api_not_deployed';
      throw apiErr;
    }
    throw err;
  }
}

export async function fetchDeliverySentDetail(sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('Missing delivery id.');
  const local = await getLocalSentDelivery(sid);
  try {
    const payload = await warehouseMobileRequest('delivery-sent-detail', { session_id: sid });
    const localUri = String(local?.driver_signature_data_uri || '').trim();
    const apiUri = String(payload?.driver_signature_data_uri || '').trim();
    const session = payload?.session && typeof payload.session === 'object'
      ? {
        ...payload.session,
        customer_name: payload.session.customer_name || local?.customer_name || '',
        customer_phone: payload.session.customer_phone || local?.customer_phone || '',
        document_kind: payload.session.document_kind || local?.document_kind || 'delivery',
        partial_delivery: payload.session.partial_delivery === true || local?.partial_delivery === true,
      }
      : payload?.session;
    const printGroups = (Array.isArray(payload?.print_groups) && payload.print_groups.length)
      ? payload.print_groups
      : (local?.print_groups || []);
    const merged = {
      ...payload,
      session,
      print_groups: printGroups,
      driver_signature_data_uri: (localUri && (!apiUri || localUri.startsWith('data:image/')))
        ? localUri
        : (apiUri || localUri),
    };
    return merged;
  } catch (err) {
    if (local) return localSentToDetail(local);
    if (isUnknownOpError(err)) {
      const apiErr = new Error('delivery_sent_detail_not_deployed');
      apiErr.code = 'api_not_deployed';
      throw apiErr;
    }
    throw err;
  }
}
