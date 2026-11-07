/**
 * Mobile brand tokens — keep hex values aligned with src/design-tokens.css
 * (`node scripts/syncBrandTheme.js` copies this into each app’s shared/ folder).
 */
export const theme = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#243044',
  border: '#334155',
  borderFocus: '#9fa6b2',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  primary: '#c9ced6',
  primaryHover: '#b5bbc5',
  primaryDark: '#9fa6b2',
  primarySoft: '#eef0f3',
  primaryOnPrimary: '#1f2937',
  primaryBg: '#b5bbc5',
  muted: '#94a3b8',
  card: '#1e293b',
  wood: '#ca8a04',
  success: '#16a34a',
  danger: '#dc2626',
  radius: 12,
  radiusSm: 8,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
};

export const stackScreenOptions = {
  headerStyle: { backgroundColor: theme.bg },
  headerTintColor: theme.text,
  headerTitleStyle: { fontWeight: '700', fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: theme.bg },
  freezeOnBlur: true,
  animation: 'fade',
  animationDuration: 120,
  gestureEnabled: true,
};
