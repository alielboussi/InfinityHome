import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

function capitalizePersonName(raw) {
  return String(raw || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export default function DeliveryCustomerDriverSection({
  locale = 'en',
  textAlign = 'left',
  disabled = false,
  customerName = '',
  customerPhone = '',
  onCustomerChange,
  fleetDriverActive = false,
  labels = {},
  theme = { primary: '#0284c7', card: '#fff', border: '#cbd5e1', text: '#0f172a' },
  kiosk = {},
}) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(customerName || '');
  const [phoneDraft, setPhoneDraft] = useState(customerPhone || '');

  const L = {
    title: labels.title || 'Customer driver',
    addBtn: labels.addBtn || 'Add customer driver',
    addTitle: labels.addTitle || 'Customer driver',
    namePh: labels.namePh || 'Driver name',
    phonePh: labels.phonePh || 'Phone number',
    save: labels.save || 'Save',
  };

  const selected = Boolean(String(customerName || '').trim());
  const btnLabel = selected
    ? [customerName, customerPhone].filter(Boolean).join(' · ')
    : L.addBtn;

  const saveCustomer = () => {
    const name = capitalizePersonName(nameDraft);
    const phone = String(phoneDraft || '').trim();
    if (!name || !phone) return;
    onCustomerChange({ name, phone });
    setOpen(false);
  };

  return (
    <View style={[kiosk.field, styles.wrap]}>
      <Text style={[kiosk.label || styles.label, { textAlign }]}>{L.title}</Text>
      <Pressable
        style={[
          kiosk.driverPickerBtn || styles.pickerBtn,
          selected ? kiosk.driverPickerBtnSelected || styles.pickerBtnSelected : null,
          disabled || fleetDriverActive ? styles.pickerDisabled : null,
        ]}
        disabled={disabled || fleetDriverActive}
        onPress={() => {
          setNameDraft(customerName || '');
          setPhoneDraft(customerPhone || '');
          setOpen(true);
        }}
      >
        <Text
          style={[
            selected
              ? kiosk.driverPickerValueText || styles.pickerValue
              : kiosk.driverPickerPlaceholderText || styles.pickerPlaceholder,
            { textAlign: 'center' },
          ]}
          numberOfLines={2}
        >
          {btnLabel}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.title, { textAlign, color: theme.text }]}>{L.addTitle}</Text>
            <TextInput
              style={[styles.input, { textAlign }]}
              placeholder={L.namePh}
              value={nameDraft}
              onChangeText={setNameDraft}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.input, { textAlign }]}
              placeholder={L.phonePh}
              value={phoneDraft}
              onChangeText={setPhoneDraft}
              keyboardType="phone-pad"
            />
            <Pressable style={[kiosk.btn || styles.btn, styles.saveBtn]} onPress={saveCustomer}>
              <Text style={kiosk.btnText || styles.btnText}>{L.save}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  label: { fontSize: 15, fontWeight: '600' },
  pickerBtn: {
    width: '100%',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ef4444',
    backgroundColor: '#450a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBtnSelected: {
    backgroundColor: '#7f1d1d',
    borderColor: '#f87171',
  },
  pickerDisabled: { opacity: 0.45 },
  pickerPlaceholder: {
    color: '#fecaca',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  pickerValue: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 14, padding: 16, borderWidth: 1 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  btn: { padding: 12, borderRadius: 10, backgroundColor: '#0284c7', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  saveBtn: { marginTop: 4 },
});
