/**
 * Mobile brand tokens — keep aligned with src/design-tokens.css
 * (`node scripts/syncBrandTheme.js` copies into each app’s shared/ folder).
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
  /** Portal ent-banner / stack headers (design-tokens --ent-chrome-bg) */
  chromeBg: '#1f2937',
  chromeFg: '#f9fafb',
  /** Portal action buttons (portal-global-theme.css) */
  portalBtnFontFamily: 'Arial',
  portalBtnFontSize: 12,
  portalBtnFontWeight: '700',
  portalBtnHeight: 40,
  portalBtnRadius: 8,
  radius: 12,
  radiusSm: 8,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
};

/** Default React Navigation header — matches portal enterprise chrome. */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: theme.chromeBg },
  headerTintColor: theme.chromeFg,
  headerTitleStyle: {
    fontWeight: theme.portalBtnFontWeight,
    fontSize: 16,
    fontFamily: theme.portalBtnFontFamily,
    color: theme.chromeFg,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: theme.bg },
  freezeOnBlur: true,
  animation: 'fade',
  animationDuration: 120,
  gestureEnabled: true,
};

/** Portal silver primary button label */
export const portalButtonText = {
  fontFamily: theme.portalBtnFontFamily,
  fontSize: theme.portalBtnFontSize,
  fontWeight: theme.portalBtnFontWeight,
  color: theme.primaryOnPrimary,
};
