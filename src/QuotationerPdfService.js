// Unified quotation PDF helpers that delegate to the blue-header generator
import generateQuotePdf from "./quotespdf";

const safeString = (val, fallback = "") => (val === undefined || val === null ? fallback : String(val));

export async function createQuotePdfBlob(quote, items = [], companyOverride = null) {
  return generateQuotePdf(quote || {}, items || [], { mode: "blob", companyOverride });
}

export async function openOrCreateQuotationPdf(quote, items = [], company = null) {
  const blob = await createQuotePdfBlob(quote, items, company);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    const name = (safeString(quote?.customer_name || "Customer", "Customer")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "_") || "Customer");
    a.href = url;
    a.download = `${name}_Quote_${quote?.quote_number || quote?.id || ""}.pdf`;
    a.click();
  } catch {}
  return url;
}

export function buildQuotePdfNamePublic(quote) {
  const customer = (safeString(quote?.customer_name || "Customer", "Customer")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, "_") || "Customer");
  const quoteNum = safeString(quote?.quote_number || quote?.id || "", "");
  return `quotes/${quoteNum}/${customer}_Quote.pdf`;
}
