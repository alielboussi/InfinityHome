/** Display / parse warehouse product specs on list cards. */

export function formatAssemblyDimensions(assembly) {
  const l = assembly?.dim_length;
  const w = assembly?.dim_width;
  const h = assembly?.dim_height;
  const hasAny = [l, w, h].some((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  if (!hasAny) return '';
  const fmt = (v) => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '—';
  };
  return `${fmt(l)} × ${fmt(w)} × ${fmt(h)} cm`;
}

/** Volume in cm³ from length × width × height (all in cm). */
export function assemblyVolumeCm3(assembly) {
  const l = Number(assembly?.dim_length);
  const w = Number(assembly?.dim_width);
  const h = Number(assembly?.dim_height);
  if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (l <= 0 || w <= 0 || h <= 0) return null;
  const vol = l * w * h;
  return Number.isFinite(vol) ? vol : null;
}

export function assemblyVolumeM3(assembly) {
  const cm3 = assemblyVolumeCm3(assembly);
  if (cm3 == null) return null;
  return cm3 / 1_000_000;
}

/** Formatted numeric amount in cubic metres (no unit suffix). */
export function formatAssemblyVolumeAmount(assembly) {
  const m3 = assemblyVolumeM3(assembly);
  if (m3 == null) return null;
  return m3.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatAssemblyVolume(assembly) {
  const display = formatAssemblyVolumeAmount(assembly);
  if (display == null) return '';
  return `${display} m³`;
}
