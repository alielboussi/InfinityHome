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
    addBtn: labels.addBtn || 'Add Customer',
    addTitle: labels.addTitle || 'Customer driver',
    namePh: labels.namePh || 'Driver name',
    phonePh: labels.phonePh || 'Phone number',
    save: labels.save || 'Save',
  };

  const saveCustomer = () => {
    const name = capitalizePersonName(nameDraft);
    const phone = String(phoneDraft || '').trim();
    if (!name || !phone) return;
    onCustomerChange({ name, phone });
    setOpen(false);
  };

  const openModal = () => {
    setNameDraft(customerName || '');
    setPhoneDraft(customerPhone || '');
    setOpen(true);
  };

  return (
    <View style={[kiosk.field || styles.field]}>
      <Text style={[kiosk.label || styles.label, { textAlign }]}>{L.title}</Text>
      <Pressable
        style={[
          kiosk.driverPickerBtn,
          customerName ? kiosk.driverPickerBtnSelected : null,
        ]}
        disabled={disabled || fleetDriverActive}
        onPress={openModal}
      >
        <Text
          style={[
            customerName ? kiosk.driverPickerValueText : kiosk.driverPickerPlaceholderText,
            { textAlign: 'center' },
          ]}
          numberOfLines={2}
        >
          {customerName
            ? `${customerName}${customerPhone ? ` · ${customerPhone}` : ''}`
            : L.addBtn}
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
  field: { marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
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
