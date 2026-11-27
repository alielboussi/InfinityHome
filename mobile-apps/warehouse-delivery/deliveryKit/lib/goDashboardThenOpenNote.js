/**
 * After a successful submit: leave the signature stack and handle the note from Dashboard.
 * Floor 1 / orders: Epson Email Print. Farm: share / send sheet.
 */
export function goDashboardThenOpenNote(navigation, note) {
  if (!navigation) return;
  const pendingDeliveryNote = note && typeof note === 'object' ? { ...note } : null;
  const params = pendingDeliveryNote && String(pendingDeliveryNote.deliveryNumber || '').trim()
    ? { pendingDeliveryNote }
    : undefined;

  if (typeof navigation.reset === 'function') {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Dashboard', params }],
    });
    return;
  }
  navigation.navigate('Dashboard', params);
}
