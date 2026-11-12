import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import { tUi, textForDisplay } from '../lib/productionKioskI18n';
import { ordersUnitOptions, unitLabel } from '../lib/quoteLineFields';
import { theme } from '../shared/theme';

function RoBox({ label, value, multiline = false }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <View style={kiosk.field}>
      {label ? <Text style={kiosk.label}>{label}</Text> : null}
      <View style={[styles.roInput, multiline && styles.roArea]}>
        <Text style={[styles.roText, display === '—' && styles.roEmpty]}>{display}</Text>
      </View>
    </View>
  );
}

function GridCol({ children }) {
  return <View style={styles.gridCol}>{children}</View>;
}

export default function QuoteReadOnlyForm({ quote, items, units, routing, locale }) {
  const route = String(routing?.route || '').toLowerCase();
  const vatLabel = quote?.vat_apply ? tUi('vat16', locale) : tUi('vat0', locale);
  const currency = quote?.currency || 'K';
  const subtotal = Number(quote?.subtotal ?? 0);
  const total = Number(quote?.total ?? 0);
  const vatAmount = quote?.vat_apply ? Math.max(0, total - subtotal + Number(quote?.discount || 0)) : 0;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={kiosk.card}>
        <Text style={kiosk.metaLine}>{quote?.quote_number || 'Quote'}</Text>
        <Text style={kiosk.hint}>
          {route === 'carpentry' ? tUi('routeCarpentry', locale) : route === 'upholstery' ? tUi('routeUpholstery', locale) : '—'}
          {routing?.sent_to_production_at ? ' · sent to production' : ''}
        </Text>
      </View>

      <View style={kiosk.card}>
        <RoBox label={tUi('customer', locale)} value={textForDisplay(quote?.customer_name, '')} />
        <RoBox label={tUi('phone', locale)} value={quote?.customer_phone || ''} />
        <View style={styles.gridRow}>
          <GridCol>
            <RoBox label={tUi('vat', locale)} value={vatLabel} />
          </GridCol>
          <GridCol>
            <RoBox label={tUi('currency', locale)} value={currency} />
          </GridCol>
        </View>
      </View>

      {(items || []).map((line, index) => {
        const showUph = route === 'upholstery';
        const showCarp = route === 'carpentry';
        const unitMeta = ordersUnitOptions(units, line.unit_id).find((u) => String(u.id) === String(line.unit_id));
        const unitName = unitMeta ? unitLabel(unitMeta) : '';
        const key = line.id || `line-${index}`;
        return (
          <View key={key} style={kiosk.card}>
            <View style={styles.gridRow}>
              <GridCol>
                <RoBox label={tUi('product', locale)} value={line.name || line.name_override} />
              </GridCol>
              <GridCol>
                <RoBox label={tUi('qty', locale)} value={line.quantity} />
              </GridCol>
            </View>
            <RoBox label={tUi('description', locale)} value={line.description} multiline />
            <View style={styles.gridRow}>
              <GridCol>
                <RoBox label={tUi('unit', locale)} value={unitName} />
              </GridCol>
              <GridCol>
                <RoBox label={tUi('price', locale)} value={line.unit_price} />
              </GridCol>
            </View>
            {(showUph || showCarp) ? (
              <>
                <View style={styles.gridRow}>
                  <GridCol>
                    <RoBox label={tUi('dimL', locale)} value={line.dim_l_cm} />
                  </GridCol>
                  <GridCol>
                    <RoBox label={tUi('dimW', locale)} value={line.dim_w_cm} />
                  </GridCol>
                  <GridCol>
                    <RoBox label={tUi('dimH', locale)} value={line.dim_h_cm} />
                  </GridCol>
                </View>
                {showUph ? (
                  <>
                    <View style={styles.gridRow}>
                      <GridCol>
                        <RoBox label={tUi('leather', locale)} value={line.leather_code} />
                      </GridCol>
                      <GridCol>
                        <RoBox label={tUi('foam', locale)} value={line.foam_type} />
                      </GridCol>
                    </View>
                    <RoBox label={tUi('wood', locale)} value={line.wood} />
                  </>
                ) : null}
                {showCarp ? (
                  <View style={styles.gridRow}>
                    <GridCol>
                      <RoBox label={tUi('color', locale)} value={line.color_code} />
                    </GridCol>
                    <GridCol>
                      <RoBox label={tUi('wood', locale)} value={line.wood} />
                    </GridCol>
                  </View>
                ) : null}
                {showCarp && (line.accessories || []).length ? (
                  <RoBox
                    label={tUi('accessories', locale)}
                    value={(line.accessories || []).join(', ')}
                    multiline
                  />
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}

      <View style={kiosk.card}>
        <Text style={kiosk.hint}>
          {tUi('subtotal', locale)} {currency} {subtotal.toFixed(2)}
        </Text>
        <Text style={kiosk.hint}>
          {tUi('vat', locale)} {currency} {vatAmount.toFixed(2)}
        </Text>
        <Text style={kiosk.metaLine}>
          {tUi('total', locale)} {currency} {total.toFixed(2)}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gridRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  gridCol: { flex: 1, minWidth: 0 },
  roInput: {
    ...kiosk.input,
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: '#f1f5f9',
  },
  roArea: { minHeight: 80 },
  roText: { color: theme.text, fontWeight: '600', fontSize: 15 },
  roEmpty: { color: theme.textDim, fontWeight: '500' },
});
