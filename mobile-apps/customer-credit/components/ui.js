import { Pressable, Text, View } from 'react-native';
import { colors, styles } from '../theme';
import { CURRENCIES, formatMoney } from '../utils/format';

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

export function CurrencyToggle({ value, onChange, label = 'Currency' }) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.currencyRow}>
        {CURRENCIES.map((currency) => {
          const active = value === currency;
          return (
            <Pressable
              key={currency}
              style={[styles.currencyBtn, active && styles.currencyBtnActive]}
              onPress={() => onChange(currency)}
            >
              <Text style={[styles.currencyBtnText, active && styles.currencyBtnTextActive]}>
                {currency === 'K' ? 'Kwacha (K)' : 'US Dollar ($)'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function DualBalanceText({ balanceByCurrency, style, amountStyle, alwaysShow = false }) {
  const parts = alwaysShow
    ? CURRENCIES
    : CURRENCIES.filter((currency) => Number(balanceByCurrency?.[currency]) > 0.01);
  if (!parts.length) {
    return <Text style={style}>{formatMoney(0)}</Text>;
  }
  return (
    <View style={{ gap: 4 }}>
      {parts.map((currency) => (
        <Text key={currency} style={amountStyle || style}>
          {formatMoney(balanceByCurrency?.[currency] || 0, currency)}
        </Text>
      ))}
    </View>
  );
}

export function HorizontalMoneyRow({ balanceByCurrency, amountStyle, dividerColor = colors.border }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      {CURRENCIES.map((currency, index) => (
        <View key={currency} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {index > 0 ? <View style={{ width: 1, height: 18, backgroundColor: dividerColor }} /> : null}
          <Text style={amountStyle}>{formatMoney(balanceByCurrency?.[currency] || 0, currency)}</Text>
        </View>
      ))}
    </View>
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

export function CustomerBalanceCard({ customer, onPress, compact = false }) {
  if (compact) {
    return (
      <Pressable
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }]}
        onPress={onPress}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{customer.name}</Text>
          {customer.phone ? <Text style={styles.cardSub} numberOfLines={1}>{customer.phone}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <HorizontalMoneyRow
            balanceByCurrency={customer.balanceByCurrency}
            amountStyle={{ fontSize: 15, fontWeight: '800', color: colors.primary }}
          />
          {customer.overdue ? (
            <View style={[styles.badge, { backgroundColor: colors.dangerSoft, marginTop: 0 }]}>
              <Text style={[styles.badgeText, { color: colors.danger }]}>
                Overdue {Math.abs(customer.daysRemaining)}d
              </Text>
            </View>
          ) : customer.hasBalance ? (
            <View style={[styles.badge, { backgroundColor: colors.warningSoft, marginTop: 0 }]}>
              <Text style={[styles.badgeText, { color: colors.warning }]}>
                {customer.daysRemaining}d left
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.cardTitle}>{customer.name}</Text>
      {customer.phone ? <Text style={styles.cardSub}>{customer.phone}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <HorizontalMoneyRow
          balanceByCurrency={customer.balanceByCurrency}
          amountStyle={{ fontSize: 18, fontWeight: '800', color: colors.primary }}
        />
      </View>
      {customer.overdue ? (
        <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.badgeText, { color: colors.danger }]}>
            Overdue by {Math.abs(customer.daysRemaining)} days
          </Text>
        </View>
      ) : customer.hasBalance ? (
        <View style={[styles.badge, { backgroundColor: colors.warningSoft }]}>
          <Text style={[styles.badgeText, { color: colors.warning }]}>
            {customer.daysRemaining} days left
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
