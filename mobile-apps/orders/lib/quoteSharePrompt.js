import { Alert } from 'react-native';
import { tUi } from './productionKioskI18n';
import { shareQuotePdfToWhatsApp } from './quotePdfShare';

export function promptShareQuotePdf(quoteId, locale = 'en') {
  return new Promise((resolve) => {
    Alert.alert(
      tUi('shareQuote', locale),
      'Share the quote PDF to WhatsApp or another app?',
      [
        { text: tUi('close', locale), style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Share PDF',
          onPress: async () => {
            try {
              await shareQuotePdfToWhatsApp(quoteId);
              resolve(true);
            } catch (err) {
              Alert.alert('Share failed', err?.message || 'Could not share PDF.');
              resolve(false);
            }
          },
        },
      ],
    );
  });
}
