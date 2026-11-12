/** Manufacture grids — Floor 2 WIP photos only (never Floor 1 catalog image_url). */
export function pickManufactureFloor2ImageUrl(item) {
  const direct = String(item?.floor2_image_url || '').trim();
  if (direct) return direct;
  const meta = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  return String(
    meta.floor2_wip_image_url
    || meta.floor2_wip_family_image_url
    || '',
  ).trim();
}
