import { StyleSheet, Text, View } from 'react-native';
import { kiosk } from './kioskStyles';
import DropdownSelect from './DropdownSelect';
import {
  applyRepairReasonPick,
  carpentryRepairReasonOptions,
  upholsteryRepairReasonOptions,
} from '../lib/repairReasonOptions';

export default function RepairReasonPickers({ value, onChange, required = false }) {
  const row = value || {};
  const upholVal = row.reason_group === 'upholstery' && row.reason ? `upholstery::${row.reason}` : '';
  const carpVal = row.reason_group === 'carpentry' && row.reason ? `carpentry::${row.reason}` : '';
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.col}>
          <DropdownSelect
            compact
            label={required ? 'Upholstery *' : 'Upholstery'}
            value={upholVal}
            options={upholsteryRepairReasonOptions()}
            onChange={(v) => onChange(applyRepairReasonPick(v))}
          />
        </View>
        <View style={styles.col}>
          <DropdownSelect
            compact
            label={required ? 'Carpentry *' : 'Carpentry'}
            value={carpVal}
            options={carpentryRepairReasonOptions()}
            onChange={(v) => onChange(applyRepairReasonPick(v))}
          />
        </View>
      </View>
      {required && !String(row.reason || '').trim() ? (
        <Text style={styles.reqHintText}>Choose one upholstery or carpentry reason.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  reqHintText: { ...kiosk.hint, fontSize: 13, marginTop: 6 },
});
