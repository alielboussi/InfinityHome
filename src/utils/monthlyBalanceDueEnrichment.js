import { buildLaybyPdfUrlForWhatsApp } from '../services/whatsappPdfs';

function laybyRowByCustomerId(laybyRows = []) {
  return new Map(
    (laybyRows || [])
      .filter((row) => row?.customerId)
      .map((row) => [String(row.customerId), row])
  );
}

export async function enrichBalanceDueRowsWithLaybyPdfs(balanceRows = [], laybyRows = []) {
  const byCustomer = laybyRowByCustomerId(laybyRows);
  const enriched = [];

  for (const row of balanceRows) {
    const laybyRow = byCustomer.get(String(row.customerId));
    let laybyPdfUrl = String(row.laybyPdfUrl || '').trim();
    if (!laybyPdfUrl && laybyRow) {
      const laybyId = row.laybyId || laybyRow.primaryLayby?.id || laybyRow.laybys?.[0]?.id || null;
      const pdf = await buildLaybyPdfUrlForWhatsApp({
        laybyId,
        customerId: row.customerId,
        laybySnapshot: laybyRow,
      });
      laybyPdfUrl = String(pdf?.url || '').trim();
    }
    enriched.push({ ...row, laybyPdfUrl });
  }

  return enriched;
}
