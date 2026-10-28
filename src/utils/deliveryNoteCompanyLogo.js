/** Web: load logo from /public/bestrest-logo.jpg for delivery note print HTML. */
let cachedWebLogo = null;

export async function getDeliveryNoteCompanyLogoDataUriWeb() {
  if (cachedWebLogo) return cachedWebLogo;
  try {
    const response = await fetch(`${process.env.PUBLIC_URL || ''}/bestrest-logo.jpg`, { cache: 'force-cache' });
    if (!response.ok) return '';
    const blob = await response.blob();
    const dataUri = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    cachedWebLogo = dataUri;
    return dataUri;
  } catch {
    return '';
  }
}

export const DELIVERY_NOTE_DISCLAIMER =
  'By signing this document, the driver and dispatcher named above confirm that the goods listed have been verified, loaded onto the vehicle for delivery, and accept responsibility for the accuracy and completeness of this shipment.';
