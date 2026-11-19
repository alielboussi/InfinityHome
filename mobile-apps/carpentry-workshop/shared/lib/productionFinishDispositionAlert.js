import { Alert } from 'react-native';

/** After a job/order finish confirm, pick Floor 1 stock vs Delivery app queue. */
export function alertProductionFinishDisposition({
  tUi,
  locale,
  onFloor1,
  onDelivery,
}) {
  Alert.alert(
    tUi('quoteOrderDispositionTitle', locale),
    tUi('quoteOrderDispositionPrompt', locale),
    [
      { text: tUi('cancel', locale), style: 'cancel' },
      { text: tUi('quoteLineHandoffFloor1', locale), onPress: onFloor1 },
      { text: tUi('quoteLineHandoffDelivery', locale), onPress: onDelivery },
    ],
  );
}