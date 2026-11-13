/** Which catalog photo the label QR resolves — Floor 1 assembly image vs Floor 2 WIP. */

export const LABEL_PHOTO_FLOOR1 = 'floor1';
export const LABEL_PHOTO_FLOOR2 = 'floor2';

export function normalizeLabelPhotoFloor(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return LABEL_PHOTO_FLOOR1;
  if (v === '2' || v === 'floor2' || v === 'floor_2' || v === 'warehouse_floor_2' || v === 'floor-2') {
    return LABEL_PHOTO_FLOOR2;
  }
  return LABEL_PHOTO_FLOOR1;
}

export function inferLabelPhotoFloorFromPrintSource(clientSource) {
  const s = String(clientSource || '').trim().toLowerCase();
  if (!s) return LABEL_PHOTO_FLOOR1;
  if (
    s.includes('floor_2')
    || s.includes('floor2')
    || s === 'warehouse_floor_2'
    || s.includes('warehouse_floor2')
  ) {
    return LABEL_PHOTO_FLOOR2;
  }
  return LABEL_PHOTO_FLOOR1;
}

export function resolveLabelPhotoFloor({ explicit, clientSource } = {}) {
  if (explicit != null && String(explicit).trim() !== '') {
    return normalizeLabelPhotoFloor(explicit);
  }
  return inferLabelPhotoFloorFromPrintSource(clientSource);
}

export function productionLabelPhotoFloorArgs(body = {}) {
  const photoFloor = resolveLabelPhotoFloor({
    explicit: body.photo_floor ?? body.photoFloor ?? body.label_photo_floor,
    clientSource: body.client_source || body.clientSource,
  });
  return { photoFloor };
}
