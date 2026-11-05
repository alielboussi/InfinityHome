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
  try {
    return await warehouseMobileRequest('delivery-sent-detail', { session_id: sid });
  } catch (err) {
    const local = await getLocalSentDelivery(sid);
    if (local) return localSentToDetail(local);
    if (isUnknownOpError(err)) {
      const apiErr = new Error('delivery_sent_detail_not_deployed');
      apiErr.code = 'api_not_deployed';
      throw apiErr;
    }
    throw err;
  }
}
