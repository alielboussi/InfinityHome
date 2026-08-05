import { Pressable, Text, View } from 'react-native';
import { colors, styles } from '../theme';
import { formatMoney } from '../utils/format';

export function ScreenWrap({ children, style }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function PrimaryButton({ title, onPress, disabled }) {
  return (
    <Pressable
      style={[styles.btn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress }) {
  return (
    <Pressable style={styles.btnSecondary} onPress={onPress}>
      <Text style={styles.btnSecondaryText}>{title}</Text>
    </Pressable>
  );
}

export function StatCard({ label, value, tone = 'default' }) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'warning' ? colors.warningSoft : colors.primarySoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.primary;
  return (
    <View style={[styles.card, { flex: 1, backgroundColor: bg, borderColor: bg }]}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '800', color: fg, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

export function CustomerBalanceCard({ customer, onPress }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.cardTitle}>{customer.name}</Text>
      {customer.phone ? <Text style={styles.cardSub}>{customer.phone}</Text> : null}
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary, marginTop: 8 }}>
        {formatMoney(customer.balance)}
      </Text>
      {customer.overdue ? (
        <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.badgeText, { color: colors.danger }]}>
            Overdue by {Math.abs(customer.daysRemaining)} days
          </Text>
        </View>
      ) : customer.balance > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
          <Text style={[styles.badgeText, { color: colors.warning }]}>
            {customer.daysRemaining} days left
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
