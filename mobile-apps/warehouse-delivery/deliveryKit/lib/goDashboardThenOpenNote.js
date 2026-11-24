/**
 * After a successful submit: leave the signature stack and open the PDF from Dashboard
 * (system share/viewer — not an in-app A4 WebView print).
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
