const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INPUT = path.join(ROOT, 'messages.html');
const OUT_ITEMS = path.join(ROOT, 'src', 'data', 'laybyTelegramItemFallbacks.json');
const OUT_SETTLEMENTS = path.join(ROOT, 'src', 'data', 'laybyTelegramSettlementFallbacks.json');

const decodeHtml = (value) => String(value || '')
  .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
  .replace(/&quot;/gi, '"')
  .replace(/&amp;/gi, '&')
  .replace(/&nbsp;/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '');

const toIsoFromYmd = (value) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const toDmy = (isoDate) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(isoDate || '').trim());
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const toNumber = (value) => Number(String(value || '0').replace(/,/g, '').trim()) || 0;

const parseMessage = (text) => {
  const plain = decodeHtml(text);
  const lines = plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const customerLine = lines.find((line) => /^Customer Name:/i.test(line));
  if (!customerLine) return null;
  const customerName = customerLine.replace(/^Customer Name:\s*/i, '').trim();
  if (!customerName) return null;

  const dateLine = lines.find((line) => /^Date:/i.test(line));
  const rawDate = dateLine ? dateLine.replace(/^Date:\s*/i, '').trim() : '';
  const isoDate = toIsoFromYmd(rawDate);

  const dueLine = lines.find((line) => /^Total Amount Due:/i.test(line));
  const paidLine = lines.find((line) => /^Total Amount Paid:/i.test(line));
  const totalLine = lines.find((line) => /^Total Layby Amount:/i.test(line));

  const dueMatch = /^Total Amount Due:\s*([A-Z$KUSD]+)\s*([0-9,]+(?:\.[0-9]+)?)$/i.exec(dueLine || '');
  const paidMatch = /^Total Amount Paid:\s*([A-Z$KUSD]+)\s*([0-9,]+(?:\.[0-9]+)?)$/i.exec(paidLine || '');
  const totalMatch = /^Total Layby Amount:\s*([A-Z$KUSD]+)\s*([0-9,]+(?:\.[0-9]+)?)$/i.exec(totalLine || '');

  const due = dueMatch ? toNumber(dueMatch[2]) : 0;
  const paid = paidMatch ? toNumber(paidMatch[2]) : 0;
  const total = totalMatch ? toNumber(totalMatch[2]) : 0;

  const productsIndex = lines.findIndex((line) => /^Products:/i.test(line));
  const paymentsIndex = lines.findIndex((line) => /^Payments:/i.test(line));
  const totalsStartIndex = lines.findIndex((line) => /^Total Layby Amount:/i.test(line));

  const productBlockStart = productsIndex >= 0 ? productsIndex + 1 : -1;
  const productBlockEnd = paymentsIndex >= 0
    ? paymentsIndex
    : (totalsStartIndex >= 0 ? totalsStartIndex : lines.length);

  const itemRegex = /^-\s+(.+?)\s+x([0-9]+(?:\.[0-9]+)?)\s+=\s+([A-Z$KUSD]+)\s*([0-9,]+(?:\.[0-9]+)?)$/i;
  const items = [];
  if (productBlockStart >= 0) {
    for (let i = productBlockStart; i < productBlockEnd; i += 1) {
      const line = lines[i];
      const match = itemRegex.exec(line);
      if (!match) continue;
      const qty = toNumber(match[2]);
      const amount = toNumber(match[4]);
      const price = qty > 0 ? Number((amount / qty).toFixed(2)) : amount;
      items.push({
        qty,
        name: match[1].trim(),
        price,
        amount,
        color: null,
      });
    }
  }

  const settlementRows = [];
  if (paymentsIndex >= 0) {
    const paymentsEnd = totalsStartIndex >= 0 ? totalsStartIndex : lines.length;
    const paymentRegex = /^([0-9]{4}-[0-9]{2}-[0-9]{2})\s+([A-Z_]+):\s*([A-Z$KUSD]+)\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*\(Ref:\s*([^\)]+)\))?(?:\s*\(([^\)]*)\))?$/i;
    for (let i = paymentsIndex + 1; i < paymentsEnd; i += 1) {
      const line = lines[i];
      const match = paymentRegex.exec(line);
      if (!match) continue;
      const date = toDmy(match[1]);
      const paymentType = String(match[2] || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      const amount = toNumber(match[4]);
      const reference = String(match[5] || '').trim();
      const extra = String(match[6] || '').trim();
      const descriptionParts = [];
      if (reference) descriptionParts.push(`Ref: ${reference}`);
      if (extra) descriptionParts.push(extra);
      settlementRows.push({
        date,
        description: descriptionParts.join(' - '),
        paymentType: paymentType || 'Cash',
        amount,
      });
    }
  }

  return {
    customerName,
    isoDate,
    total,
    paid,
    due,
    items,
    settlementRows,
  };
};

(function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error(`Missing ${INPUT}`);
  }

  const raw = fs.readFileSync(INPUT, 'utf8');
  const msgRegex = /<div class="message default clearfix(?: joined)?" id="message(?<id>\d+)">[\s\S]*?<div class="text">(?<text>[\s\S]*?)<\/div>[\s\S]*?<\/div>\s*<\/div>/gi;

  const byCustomer = new Map();
  let match;
  while ((match = msgRegex.exec(raw)) !== null) {
    const id = Number(match.groups?.id || 0);
    const text = String(match.groups?.text || '');
    const parsed = parseMessage(text);
    if (!parsed) continue;
    const key = parsed.customerName.trim().toLowerCase();
    const prev = byCustomer.get(key);
    if (!prev || id > prev.id) {
      byCustomer.set(key, { id, ...parsed });
    }
  }

  const itemFallbacks = {};
  const settlementFallbacks = {};
  byCustomer.forEach((entry, key) => {
    if (entry.items && entry.items.length && entry.due > 0) {
      itemFallbacks[key] = [{
        dmy: entry.isoDate ? `${entry.isoDate.slice(8, 10)}.${entry.isoDate.slice(5, 7)}.${entry.isoDate.slice(0, 4)}` : '',
        isoDate: entry.isoDate || null,
        items: entry.items,
      }];
    }
    if (entry.settlementRows && entry.settlementRows.length && entry.due > 0) {
      settlementFallbacks[key] = entry.settlementRows;
    }
  });

  fs.mkdirSync(path.dirname(OUT_ITEMS), { recursive: true });
  fs.writeFileSync(OUT_ITEMS, JSON.stringify(itemFallbacks, null, 2));
  fs.writeFileSync(OUT_SETTLEMENTS, JSON.stringify(settlementFallbacks, null, 2));

  console.log(`Wrote ${OUT_ITEMS}`);
  console.log(`Wrote ${OUT_SETTLEMENTS}`);
})();
