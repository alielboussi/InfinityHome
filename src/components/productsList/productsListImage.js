import { resolveProductImageUrl } from '../../utils/productImageUrl';

export function getListItemImageUrl(item) {
  if (item?.__isCombo) {
    return resolveProductImageUrl(item.picture_url || '');
  }
  return resolveProductImageUrl(item?.image_url || '');
}
