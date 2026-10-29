export const WAREHOUSE_STORAGE_SEND_STATUSES = Object.freeze({
  IN_STORAGE: 'in_storage',
  DELIVERED: 'delivered',
});

export function isWarehouseStorageSendActive(status) {
  return String(status || '') === WAREHOUSE_STORAGE_SEND_STATUSES.IN_STORAGE;
}
