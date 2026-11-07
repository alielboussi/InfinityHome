/**
 * Mobile brand tokens — keep hex values aligned with src/design-tokens.css
 * (`node scripts/syncBrandTheme.js` copies this into each app’s shared/ folder).
 */
export const theme = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#243044',
  border: '#334155',
  borderFocus: '#0d9488',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  primary: '#0d9488',
  primaryHover: '#0f766e',
  primaryDark: '#115e59',
  primarySoft: '#f0fdfa',
  primaryOnPrimary: '#ffffff',
  primaryBg: '#134e4a',
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
