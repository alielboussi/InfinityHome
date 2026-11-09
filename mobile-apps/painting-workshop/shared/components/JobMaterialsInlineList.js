import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import {
  formatMaterialUom,
  humanizeUomCode,
  materialAssemblyIdFromStoredRow,
  storeroomLabelForLocationId,
  warehouseLocationIdFromStoredRow,
  warehouseNameToStoreroomLabel,
} from '../lib/storeroomDeductionFlow';

function lineStoreroomLabel(line, labelByLocationId, storerooms) {
  const fromLine = warehouseNameToStoreroomLabel(line?.storeroom_label || '');
  if (fromLine) return fromLine;
  const locId = warehouseLocationIdFromStoredRow(line);
  if (locId && labelByLocationId?.get(locId)) return labelByLocationId.get(locId);
  const fromId = storeroomLabelForLocationId(locId, storerooms);
  if (fromId) return fromId;
  return '—';
}

function lineDisplayName(line) {
  const name = String(line?.name || '').trim();
  if (name) return name;
  const id = materialAssemblyIdFromStoredRow(line);
  if (id && !/^[0-9a-f-]{30,}$/i.test(id)) return id;
  return '—';
}

function formatQtyUom(line) {
  const qty = Math.max(0, Number(line.quantity) || 0);
  const uom = formatMaterialUom(line) || humanizeUomCode(line?.uom || 'ea');
  return `${qty} ${uom}`;
}

export default function JobMaterialsInlineList({
  lines,
  locale,
  tUi,
  textAlign = 'left',
  storeroomLabelByLocationId,
  storerooms,
  onEditMaterials,
  canEdit = false,
}) {
  const [open, setOpen] = useState(false);
  const rows = Array.isArray(lines) ? lines.filter((l) => Math.max(0, Number(l.quantity) || 0) > 0) : [];
  if (!rows.length) return null;
  const label = typeof tUi === 'function'
    ? tUi('jobMaterialsExpand', locale)
    : 'Materials';
  const editLabel = typeof tUi === 'function' ? tUi('edit', locale) : 'Edit';
  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.toggleText, { textAlign }]}>
          {open ? '▾' : '▸'}
          {' '}
          {label.replace('{count}', String(rows.length))}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {rows.map((line, idx) => {
            const key = `${materialAssemblyIdFromStoredRow(line)}-${warehouseLocationIdFromStoredRow(line) || idx}`;
            const sku = String(line.family_sku || '').trim();
            const storeroom = lineStoreroomLabel(line, storeroomLabelByLocationId, storerooms);
            return (
              <View key={key} style={styles.row}>
                <Text style={[styles.name, { textAlign }]}>{lineDisplayName(line)}</Text>
                <Text style={[styles.meta, { textAlign }]}>
                  {sku ? `${sku} · ` : ''}
                  {formatQtyUom(line)}
                  {' · '}
                  {storeroom}
                </Text>
              </View>
            );
          })}
          {canEdit && typeof onEditMaterials === 'function' ? (
            <Pressable style={styles.editBtn} onPress={onEditMaterials}>
              <Text style={[styles.editBtnText, { textAlign }]}>
                {editLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surfaceElevated,
  },
  toggleText: { fontWeight: '700', color: theme.primary, fontSize: 14 },
  panel: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    gap: 8,
  },
  row: { gap: 2 },
  name: { fontWeight: '700', color: theme.text, fontSize: 14 },
  meta: { color: theme.textMuted, fontSize: 12 },
  editBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  editBtnText: { color: theme.primary, fontWeight: '700', fontSize: 13 },
});
