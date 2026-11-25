function trimStr(v) {
  return String(v || '').trim();
}

function canonicalName(v) {
  return trimStr(v).toLowerCase().replace(/\s+/g, ' ');
}

async function firstPhoneByName(sb, table, name) {
  const key = canonicalName(name);
  if (!key) return '';
  const { data: exact } = await sb.from(table).select('name, phone').eq('name', name).limit(20);
  const exactHit = (exact || []).find((row) => trimStr(row?.phone));
  if (exactHit) return trimStr(exactHit.phone);
  const { data: listed } = await sb.from(table).select('name, phone').limit(800);
  const fuzzy = (listed || []).find((row) => canonicalName(row?.name) === key && trimStr(row?.phone));
  return fuzzy ? trimStr(fuzzy.phone) : '';
}

/**
 * Hassan quotes may point at POS `customers` (empty phone) while the 9-digit
 * number lives on `quote_customers` under a different id (same name).
 */
export async function resolveQuoteOrderCustomerContact(sb, quoteRow, routingMeta = {}) {
  const cid = trimStr(quoteRow?.customer_id);
  let name = '';
  let phone = '';
  if (cid) {
    const [{ data: cust }, { data: qc }] = await Promise.all([
      sb.from('customers').select('name, phone').eq('id', cid).maybeSingle(),
      sb.from('quote_customers').select('name, phone').eq('id', cid).maybeSingle(),
    ]);
    name = trimStr(cust?.name || qc?.name);
    phone = trimStr(cust?.phone) || trimStr(qc?.phone);
  }
  const meta = routingMeta && typeof routingMeta === 'object' ? routingMeta : {};
  if (!phone) phone = trimStr(meta.customer_phone || quoteRow?.customer_phone);
  if (!name) name = trimStr(meta.customer_name || quoteRow?.customer_name);
  if (!phone && name) {
    phone = await firstPhoneByName(sb, 'quote_customers', name)
      || await firstPhoneByName(sb, 'customers', name);
  }
  return { name, phone };
}
