import db from '../dataClient';
import { rewriteLegacyStorageUrl, extractStorageObjectPath, firebasePublicUrlForObject } from './storageImageUrl';

function publicAsset(path) {
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}` || suffix;
}

export const STATIC_BRAND_LOGO = publicAsset('/bestrest-logo.png');
export const STATIC_BRAND_STAMP = publicAsset('/bestreststamp.png');

export async function fetchCompanyLogoUrl(client = db) {
  try {
    const { data } = await client.from('company_settings').select('company_logo').maybeSingle();
    const url = String(data?.company_logo || '').trim();
    if (url) return url;
  } catch {
    // ignore
  }
  return '';
}

function rewriteStorageUrl(url) {
  return rewriteLegacyStorageUrl(url);
}

function companyLogoUrlCandidates(url) {
  const rewritten = rewriteStorageUrl(url);
  const candidates = [rewritten];
  const objectPath = extractStorageObjectPath(rewritten, 'companylogos');
  if (objectPath && !objectPath.startsWith('companylogos/')) {
    const alt = firebasePublicUrlForObject('companylogos', `companylogos/${objectPath}`);
    if (alt) candidates.push(alt);
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function loadAsDataUrl(url) {
  if (!url) return '';
  try {
    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

async function loadFirstDataUrl(urls) {
  for (const url of urls) {
    const data = await loadAsDataUrl(url);
    if (data) return data;
  }
  return '';
}

export function brandLogoOnError(event) {
  const img = event?.currentTarget;
  if (!img || img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = STATIC_BRAND_LOGO;
}

export async function preloadBrandAssets({ client = db, includeStamp = true } = {}) {
  const staticLogoData = await loadAsDataUrl(STATIC_BRAND_LOGO);
  let logoSrc = staticLogoData || STATIC_BRAND_LOGO;

  const companyLogoUrl = await fetchCompanyLogoUrl(client);
  if (companyLogoUrl && companyLogoUrl !== STATIC_BRAND_LOGO) {
    const companyLogoData = await loadFirstDataUrl(companyLogoUrlCandidates(companyLogoUrl));
    if (companyLogoData) logoSrc = companyLogoData;
  }

  let stampSrc = '';
  if (includeStamp) {
    const staticStampData = await loadAsDataUrl(STATIC_BRAND_STAMP);
    stampSrc = staticStampData || STATIC_BRAND_STAMP;
  }

  return { logoSrc, stampSrc, logoUrl: logoSrc };
}
