import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  if (!host || !user || !pass || !from) return null;
  return { host, port, user, pass, from };
}

async function attachmentFromUrl(pdfUrl, filename = 'receipt.pdf') {
  const url = String(pdfUrl || '').trim();
  if (!url) return null;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch PDF (${resp.status})`);
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  return {
    filename,
    content: buffer,
    contentType: 'application/pdf',
  };
}

export function isEmailConfigured() {
  return Boolean(getSmtpConfig());
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  pdfUrl,
  pdfFilename,
} = {}) {
  const cfg = getSmtpConfig();
  if (!cfg) {
    const err = new Error('SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)');
    err.status = 503;
    throw err;
  }

  const recipient = String(to || '').trim();
  if (!recipient) {
    const err = new Error('Recipient email is required');
    err.status = 400;
    throw err;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const attachments = [];
  if (pdfUrl) {
    attachments.push(await attachmentFromUrl(pdfUrl, pdfFilename || 'receipt.pdf'));
  }

  await transporter.sendMail({
    from: cfg.from,
    to: recipient,
    subject: String(subject || 'Infinity Home receipt'),
    text: text || undefined,
    html: html || undefined,
    attachments,
  });

  return { ok: true };
}
