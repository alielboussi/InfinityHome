import { DELIVERY_NOTE_LOGO_DATA_URI } from './deliveryNoteCompanyLogoEmbedded';

/** Bestrest logo as data URI for A4 delivery note HTML (expo-print). */
export async function getDeliveryNoteCompanyLogoDataUri() {
  if (DELIVERY_NOTE_LOGO_DATA_URI) return DELIVERY_NOTE_LOGO_DATA_URI;
  return '';
}
