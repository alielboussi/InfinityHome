function trimUrl(value) {
  return String(value || '').trim();
}

function urlWithoutQuery(value) {
  const url = trimUrl(value);
  if (!url) return '';
  return url.split('?')[0].split('#')[0].replace(/\/+$/, '');
}

function isFloor2WipStorageUrl(url) {
  const lower = urlWithoutQuery(url).toLowerCase();
  if (!lower) return false;
  return lower.includes('floor2-wip') || lower.includes('floor2_wip');
}

function floor2WipUrls(assembly) {
  const meta = assembly?.metadata && typeof assembly.metadata === 'object' ? assembly.metadata : {};
  return [
    assembly?.floor2_image_url,
    assembly?.floor2_wip_image_url,
    meta.floor2_wip_image_url,
    meta.floor2_wip_family_image_url,
    meta.warehouse_floor2_wip_image_url,
  ].map(trimUrl).filter(Boolean);
}

/** Floor 1 catalog photo only. Floor 2 WIP URLs are treated as missing. */
export function floor1CatalogImageUri(assembly) {
  const url = trimUrl(assembly?.image_url);
  if (!url) return '';
  if (isFloor2WipStorageUrl(url)) return '';
  const catalogKey = urlWithoutQuery(url);
  if (floor2WipUrls(assembly).some((wip) => urlWithoutQuery(wip) === catalogKey)) return '';
  return url;
}
