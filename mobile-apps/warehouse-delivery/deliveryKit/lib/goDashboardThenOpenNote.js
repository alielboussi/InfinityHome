/** After a successful submit: leave the signature stack and open the note PDF from Dashboard. */
export function goDashboardThenOpenNote(navigation, payload) {
  if (!navigation?.reset) return;
  navigation.reset({
    index: 0,
    routes: [{
      name: 'Dashboard',
      params: { pendingDeliveryNote: payload || {} },
    }],
  });
}
