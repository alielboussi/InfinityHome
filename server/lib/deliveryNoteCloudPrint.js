import { isEmailConfigured, sendEmail } from './sendEmail.js';

const MAX_PDF_BYTES = 18 * 1024 * 1024;

export function getDeliveryNoteCloudPrintAddress() {
  return String(
    process.env.EPSON_EMAIL_PRINT_TO
    || process.env.DELIVERY_A4_EMAIL_PRINT_TO
    || '',
  ).trim();
}

export function isDeliveryNoteCloudPrintConfigured() {
  return Boolean(getDeliveryNoteCloudPrintAddress() && isEmailConfigured());
}

/**
 * Email a delivery-note PDF to Epson Connect Email Print (EcoTank L3250).
 */
export async function sendDeliveryNotePdfToCloudPrinter({
  pdfBase64,
  pdfFilename,
  subject,
  deliveryNumber,
} = {}) {
  const to = getDeliveryNoteCloudPrintAddress();
  if (!to) {
    const err = new Error(
      'Epson Email Print is not configured (EPSON_EMAIL_PRINT_TO on Vercel).',
    );
    err.status = 503;
    err.code = 'cloud_print_unconfigured';
    throw err;
  }
  if (!isEmailConfigured()) {
    const err = new Error('SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    err.status = 503;
    err.code = 'cloud_print_unconfigured';
    throw err;
  }

  const raw = String(pdfBase64 || '').replace(/^data:application\/pdf(?:;[^,]*)?;base64,/i, '').replace(/\s+/g, '');
  if (!raw) {
    const err = new Error('Delivery note PDF is missing.');
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) {
    const err = new Error('Delivery note PDF is empty.');
    err.status = 400;
    throw err;
  }
  if (buffer.length > MAX_PDF_BYTES) {
    const err = new Error('Delivery note PDF is too large for Email Print (max 18 MB).');
    err.status = 400;
    throw err;
  }

  const num = String(deliveryNumber || '').trim() || 'note';
  const filename = String(pdfFilename || `Delivery_${num}.pdf`).replace(/[^\w.-]+/g, '_') || `Delivery_${num}.pdf`;
  const mailSubject = String(subject || '').trim() || `Delivery ${num}`;

  await sendEmail({
    to,
    subject: mailSubject,
    text: '.',
    pdfBuffer: buffer,
    pdfFilename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
  });

  return { ok: true, printer: 'epson_email_print', to };
}

export async function opDeliveryNoteCloudPrint(body = {}, user) {
  if (!user) {
    const err = new Error('Sign in required.');
    err.status = 401;
    throw err;
  }
  return sendDeliveryNotePdfToCloudPrinter({
    pdfBase64: body.pdf_base64 || body.pdfBase64,
    pdfFilename: body.pdf_filename || body.pdfFilename,
    subject: body.subject,
    deliveryNumber: body.delivery_number || body.deliveryNumber,
  });
}
