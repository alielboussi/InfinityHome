import { StyleSheet } from 'react-native';
import { theme } from './theme';

/** Compact, consistent actions for warehouse-catalog forms and modals. */
export const formButtonStyles = StyleSheet.create({
  primary: {
    alignSelf: 'stretch',
    backgroundColor: theme.primaryBg,
    borderRadius: theme.radiusSm,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.primaryDark,
  },
  primaryCompact: {
    alignSelf: 'center',
    minWidth: 140,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  primaryText: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  outline: {
    alignSelf: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  outlineAccent: {
    borderColor: 'rgba(56, 189, 248, 0.45)',
    backgroundColor: 'rgba(12, 74, 110, 0.35)',
  },
  outlineText: {
    color: theme.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  outlineTextAccent: {
    color: theme.primary,
  },
  textLink: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  textLinkLabel: {
    color: theme.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  disabled: { opacity: 0.45 },
});
