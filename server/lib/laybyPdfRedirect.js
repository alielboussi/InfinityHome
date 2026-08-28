import { resolveStoredLaybyPdfUrl } from './laybyPdfStorage.js';

export async function handleLaybyPdfRedirect(req, res, db) {
  const customerId = String(
    req.query?.customerId
    || req.query?.customer_id
    || req.query?.c
    || '',
  ).trim();

  if (!customerId) {
    res.status(400).send('Missing customer id');
    return;
  }

  let laybyId = null;
  try {
    const { data } = await db
      .from('laybys')
      .select('id')
      .eq('customer_id', customerId)
      .limit(1);
    laybyId = data?.[0]?.id || null;
  } catch {
    // continue with customer id only
  }

  const url = await resolveStoredLaybyPdfUrl(laybyId, customerId);
  if (!url) {
    res.status(404).send('Layby PDF not found for this customer.');
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url);
}
