import { fromPublic } from '../dbSchema';

const STORAGE_TABLE = 'factory_sold_storage_items';
const STORAGE_EVENTS_TABLE = 'factory_sold_storage_events';
const SUMMARY_VIEW = 'v_factory_sold_storage_summary';

function normalizeNullable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

async function fetchStorageRowById(id) {
  const { data, error } = await fromPublic(STORAGE_TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) {
    throw new Error(error?.message || 'Storage entry not found');
  }
  return data;
}

export async function getFactoryStorageSummary({ locationId, productIds } = {}) {
  let query = fromPublic(SUMMARY_VIEW).select('*');
  if (locationId) query = query.eq('location_id', locationId);
  if (Array.isArray(productIds) && productIds.length > 0) {
    query = query.in('product_id', productIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load factory storage summary');
  return data || [];
}

export async function getFactoryStorageItems({
  productId,
  productIds,
  locationId,
  includeReleased = false,
} = {}) {
  let query = fromPublic(STORAGE_TABLE)
    .select('*')
    .order('stored_at', { ascending: false });
  const multipleIds = Array.isArray(productIds) ? productIds.filter(Boolean) : null;
  if (multipleIds && multipleIds.length > 0) {
    query = query.in('product_id', multipleIds);
  } else if (productId) {
    query = query.eq('product_id', productId);
  }
  if (locationId) query = query.eq('location_id', locationId);
  if (!includeReleased) {
    query = query.in('status', ['stored', 'partial']);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to load factory storage items');
  return data || [];
}

export async function createFactoryStorageItem(input, actor = {}) {
  const quantity = Number(input?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }
  if (!input?.productId || !input?.locationId) {
    throw new Error('Product and location are required');
  }
  const now = new Date().toISOString();
  const payload = {
    sale_id: normalizeNullable(input.saleId),
    sale_item_id: normalizeNullable(input.saleItemId),
    product_id: input.productId,
    location_id: input.locationId,
    quantity,
    quantity_released: Number(input.quantityReleased || 0),
    status: input.status || 'stored',
    stored_at: input.storedAt || now,
    expected_release_date: normalizeNullable(input.expectedReleaseDate),
    release_reference: normalizeNullable(input.releaseReference),
    customer_name: normalizeNullable(input.customerName),
    customer_phone: normalizeNullable(input.customerPhone),
    notes: normalizeNullable(input.notes),
    metadata: input.metadata ?? { source: 'products-list' },
    created_by: normalizeNullable(actor.userUuid),
    created_by_user_id: normalizeNullable(actor.userLegacyId),
    updated_by: normalizeNullable(actor.userUuid),
    updated_by_user_id: normalizeNullable(actor.userLegacyId),
    updated_at: now,
  };
  const { data, error } = await fromPublic(STORAGE_TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message || 'Failed to create storage entry');
  try {
    await fromPublic(STORAGE_EVENTS_TABLE).insert({
      storage_id: data.id,
      event_type: 'stored',
      quantity: data.quantity,
      before_quantity: null,
      after_quantity: data.quantity,
      notes: payload.notes,
      metadata: payload.metadata,
      created_by: normalizeNullable(actor.userUuid),
      created_by_user_id: normalizeNullable(actor.userLegacyId),
    });
  } catch (eventErr) {
    console.warn('[factoryStorage] failed to insert stored event', eventErr);
  }
  return data;
}

export async function releaseFactoryStorageItem(storageId, rawQuantity, options = {}, actor = {}) {
  const baseRow = await fetchStorageRowById(storageId);
  const totalQty = Number(baseRow.quantity) || 0;
  const alreadyReleased = Number(baseRow.quantity_released) || 0;
  const remaining = Math.max(0, totalQty - alreadyReleased);
  if (remaining <= 0) {
    throw new Error('This storage entry has no quantity left to release');
  }
  const quantity = Number(rawQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Release quantity must be a positive number');
  }
  const releaseQty = Math.min(remaining, quantity);
  const releaseTime = new Date().toISOString();
  const nextReleased = alreadyReleased + releaseQty;
  const status = nextReleased >= totalQty ? 'released' : 'partial';
  const updatePayload = {
    quantity_released: nextReleased,
    status,
    updated_at: releaseTime,
    updated_by: normalizeNullable(actor.userUuid),
    updated_by_user_id: normalizeNullable(actor.userLegacyId),
  };
  if (status === 'released') {
    updatePayload.released_at = releaseTime;
  }
  if (options.releaseReference !== undefined) {
    updatePayload.release_reference = normalizeNullable(options.releaseReference);
  }
  if (options.notes) updatePayload.notes = normalizeNullable(options.notes);
  if (options.customerName) updatePayload.customer_name = normalizeNullable(options.customerName);
  if (options.customerPhone) updatePayload.customer_phone = normalizeNullable(options.customerPhone);
  const { data, error } = await fromPublic(STORAGE_TABLE)
    .update(updatePayload)
    .eq('id', storageId)
    .select()
    .single();
  if (error) throw new Error(error.message || 'Failed to release storage entry');
  try {
    await fromPublic(STORAGE_EVENTS_TABLE).insert({
      storage_id: storageId,
      event_type: 'released',
      quantity: releaseQty,
      before_quantity: remaining,
      after_quantity: remaining - releaseQty,
      notes: normalizeNullable(options.notes),
      metadata: options.metadata ?? null,
      created_by: normalizeNullable(actor.userUuid),
      created_by_user_id: normalizeNullable(actor.userLegacyId),
    });
  } catch (eventErr) {
    console.warn('[factoryStorage] failed to insert release event', eventErr);
  }
  return data;
}

export async function updateFactoryStorageItem(storageId, changes = {}, actor = {}) {
  if (!storageId) throw new Error('Storage ID is required');
  const now = new Date().toISOString();
  const payload = {
    sale_id: changes.saleId !== undefined ? normalizeNullable(changes.saleId) : undefined,
    sale_item_id: changes.saleItemId !== undefined ? normalizeNullable(changes.saleItemId) : undefined,
    expected_release_date: changes.expectedReleaseDate !== undefined ? normalizeNullable(changes.expectedReleaseDate) : undefined,
    customer_name: changes.customerName !== undefined ? normalizeNullable(changes.customerName) : undefined,
    customer_phone: changes.customerPhone !== undefined ? normalizeNullable(changes.customerPhone) : undefined,
    notes: changes.notes !== undefined ? normalizeNullable(changes.notes) : undefined,
    updated_at: now,
    updated_by: normalizeNullable(actor.userUuid),
    updated_by_user_id: normalizeNullable(actor.userLegacyId),
  };
  const sanitizedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(sanitizedPayload).length === 0) {
    throw new Error('No changes were provided');
  }
  const { data, error } = await fromPublic(STORAGE_TABLE)
    .update(sanitizedPayload)
    .eq('id', storageId)
    .select()
    .single();
  if (error) throw new Error(error.message || 'Failed to update storage entry');
  return data;
}

export async function appendFactoryStorageNote(storageId, note, actor = {}, metadata) {
  if (!note || !note.trim()) {
    throw new Error('Note text is required');
  }
  const payload = {
    storage_id: storageId,
    event_type: 'note',
    quantity: null,
    before_quantity: null,
    after_quantity: null,
    notes: note.trim(),
    metadata: metadata ?? null,
    created_by: normalizeNullable(actor.userUuid),
    created_by_user_id: normalizeNullable(actor.userLegacyId),
  };
  const { error } = await fromPublic(STORAGE_EVENTS_TABLE).insert(payload);
  if (error) throw new Error(error.message || 'Failed to append note');
}

export async function getFactoryStorageItem(storageId) {
  return fetchStorageRowById(storageId);
}
