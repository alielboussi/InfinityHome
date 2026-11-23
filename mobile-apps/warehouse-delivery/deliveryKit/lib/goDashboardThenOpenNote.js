/** After a successful send: land on Dashboard, then open the A4 PDF (no in-app Canon print). */
export function goDashboardThenOpenNote(navigation, note) {
  const payload = note && typeof note === 'object' ? note : null;
  navigation.reset({
    index: 0,
    routes: [{
      name: 'Dashboard',
      params: payload ? { pendingDeliveryNote: payload } : undefined,
    }],
  });
}
