import supabase from '../supabase';

function publicAsset(path) {
  const base = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}` || suffix;
}

export const STATIC_BRAND_LOGO = publicAsset('/bestrest-logo.png');
export const STATIC_BRAND_STAMP = publicAsset('/bestreststamp.png');

export async function fetchCompanyLogoUrl(client = supabase) {
  try {
    const { data } = await client.from('company_settings').select('company_logo').maybeSingle();
    const url = String(data?.company_logo || '').trim();
    if (url) return url;
  } catch {
    // ignore
  }
  return '';
}

function rewriteSupabaseStorageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/supabase\.co/i.test(raw)) return raw;
  try {
    const configured = String(process.env.REACT_APP_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    if (!configured) return raw;
    const currentHost = new URL(configured).host;
    return raw.replace(/^https?:\/\/[^/]+\.supabase\.co/i, `https://${currentHost}`);
  } catch {
    return raw;
  }
}

function companyLogoUrlCandidates(url) {
  const rewritten = rewriteSupabaseStorageUrl(url);
  const candidates = [rewritten];
  // Company Settings upload stores .../public/companylogos/file.png but the object key is companylogos/file.png
  const match = rewritten.match(/^(https?:\/\/[^/]+\/storage\/v1\/object\/public\/companylogos\/)(?!companylogos\/)(.+)$/i);
  if (match) candidates.push(`${match[1]}companylogos/${match[2]}`);
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

export async function preloadBrandAssets({ client = supabase, includeStamp = true } = {}) {
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
