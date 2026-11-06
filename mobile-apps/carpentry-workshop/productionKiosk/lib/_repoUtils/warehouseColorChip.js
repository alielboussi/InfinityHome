import { normalizeWarehouseColorKey } from './warehouseAssemblyMath';

const CHIP_RULES = [
  { match: ['blue', 'mavi', 'lacivert', 'navy'], bg: '#1e40af', text: '#eff6ff', border: '#3b82f6' },
  { match: ['red', 'kirmizi', 'kırmızı', 'bordo'], bg: '#b91c1c', text: '#fef2f2', border: '#f87171' },
  { match: ['green', 'yesil', 'yeşil', 'mint'], bg: '#15803d', text: '#f0fdf4', border: '#4ade80' },
  { match: ['yellow', 'sari', 'sarı', 'gold', 'altin'], bg: '#a16207', text: '#fefce8', border: '#facc15' },
  { match: ['orange', 'turuncu'], bg: '#c2410c', text: '#fff7ed', border: '#fb923c' },
  { match: ['pink', 'pembe', 'rose'], bg: '#be185d', text: '#fdf2f8', border: '#f472b6' },
  { match: ['purple', 'mor', 'lila', 'violet'], bg: '#6d28d9', text: '#f5f3ff', border: '#a78bfa' },
  { match: ['grey', 'gray', 'gri', 'silver', 'gumus'], bg: '#475569', text: '#f8fafc', border: '#94a3b8' },
  { match: ['black', 'siyah'], bg: '#1e293b', text: '#f8fafc', border: '#64748b' },
  { match: ['white', 'beyaz', 'cream', 'krem', 'beige'], bg: '#e2e8f0', text: '#0f172a', border: '#cbd5e1' },
  { match: ['brown', 'kahve', 'wood', 'ahsap'], bg: '#78350f', text: '#fffbeb', border: '#d97706' },
  { match: ['turquoise', 'turkuaz', 'cyan', 'teal'], bg: '#0f766e', text: '#ecfeff', border: '#2dd4bf' },
];

const DEFAULT_CHIP = {
  bg: '#334155',
  text: '#f1f5f9',
  border: '#64748b',
};

/** Visual theme for a variant color name (warehouse product chips). */
export function getWarehouseColorChipTheme(colorName) {
  const key = normalizeWarehouseColorKey(colorName);
  if (!key) return DEFAULT_CHIP;
  for (const rule of CHIP_RULES) {
    if (rule.match.some((token) => key === token || key.includes(token))) {
      return { bg: rule.bg, text: rule.text, border: rule.border };
    }
  }
  return DEFAULT_CHIP;
}

export function warehouseColorChipInlineStyle(colorName) {
  const theme = getWarehouseColorChipTheme(colorName);
  return {
    backgroundColor: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };
}
