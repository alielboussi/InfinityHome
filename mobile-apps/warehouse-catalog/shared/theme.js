/** Shared visual tokens for warehouse-catalog mobile UI */
export const theme = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#243044',
  border: '#334155',
  borderFocus: '#38bdf8',
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  primary: '#38bdf8',
  primaryDark: '#0ea5e9',
  primaryBg: '#0c4a6e',
  /** Aliases used by kiosk UI */
  muted: '#94a3b8',
  card: '#1e293b',
  success: '#4ade80',
  danger: '#f87171',
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
  freezeOnBlur: false,
  animation: 'fade',
  animationDuration: 180,
  gestureEnabled: true,
};
