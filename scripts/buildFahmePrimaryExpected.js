import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] || 'c:/Users/aliel/Downloads/Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf';
const itemFallbacks = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/laybyPdfItemFallbacks.json'), 'utf8'),
)['mohammad fahme'];
const settlementFallbacks = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/laybyPdfSettlementFallbacks.json'), 'utf8'),
)['mohammad fahme'];

const raw = fs.readFileSync(pdfPath).toString('latin1');
const strings = [...raw.matchAll(/\(([^\\)]+)\)/g)].map((m) => m[1]);

function parseMoney(token) {
  return Number(String(token || '').replace(/[$,\s]/g, '')) || 0;
}

function dmyToIso(dmy) {
  const [day, month, year] = String(dmy).split('.');
  return `${year}-${month}-${day}`;
}

function parsePdfSections() {
  const sections = [];
  let current = null;
  for (const token of strings) {
    const dateMatch = /^Date: ([0-9]{2}\.[0-9]{2}\.[0-9]{4})$/.exec(token);
    if (dateMatch) {
      if (current) sections.push(current);
      current = { dmy: dateMatch[1], tokens: [] };
      continue;
    }
    if (token === 'Settlement') break;
    if (current) current.tokens.push(token);
  }
  if (current) sections.push(current);

  let prevDue = 0;
  return sections.map((section) => {
    const tokens = section.tokens;
    let runningDue = null;
    let sectionTotal = null;
    let discount = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i] === 'Discount' && tokens[i + 1]) discount = Math.abs(parseMoney(tokens[i + 1]));
      if (tokens[i] === 'Total Due' && tokens[i + 1]) runningDue = parseMoney(tokens[i + 1]);
      if (/^\$ [0-9,]+$/.test(tokens[i]) && tokens[i - 1] !== 'Price' && tokens[i - 1] !== 'Amount') {
        sectionTotal = parseMoney(tokens[i]);
      }
    }
    let amount = 0;
    if (runningDue != null) {
      amount = runningDue - prevDue;
      prevDue = runningDue;
    } else if (sectionTotal != null) {
      amount = sectionTotal;
      prevDue = sectionTotal;
    }
    return {
      dmy: section.dmy,
      saleDate: dmyToIso(section.dmy),
      amount,
      discount,
      runningDue,
    };
  });
}

function parseSettlementAmounts() {
  const start = strings.indexOf('Settlement');
  const slice = start >= 0 ? strings.slice(start, start + 40) : [];
  const amounts = [];
  for (const token of slice) {
    if (/^\$ [0-9,]+$/.test(token)) amounts.push(parseMoney(token));
    if (token === 'Due Remaining') break;
  }
  return amounts;
}

function toPaymentType(label) {
  const key = String(label || '').trim().toLowerCase();
  if (key === 'goods') return 'goods';
  if (key === 'bank transfer') return 'bank_transfer';
  return 'cash';
}

function dmySlashToIso(dmy) {
  const [day, month, year] = String(dmy).split('/');
  return `${year}-${month}-${day}`;
}

const pdfSales = parsePdfSections();
const settlementAmounts = parseSettlementAmounts();
const dueRemaining = parseMoney(strings[strings.indexOf('Due Remaining') + 1] || '0');
const totalSale = pdfSales[pdfSales.length - 1]?.runningDue || 0;

const itemsByDate = new Map(itemFallbacks.map((section) => [section.isoDate, section.items || []]));

const sales = pdfSales.map((sale, index) => {
  const items = (itemsByDate.get(sale.saleDate) || []).map((item) => ({
    display_name: item.name,
    quantity: Number(item.qty || 0),
    unit_price: Number(item.price || 0),
    color: item.color || null,
  }));
  const itemsSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discount = sale.discount > 0
    ? sale.discount
    : Math.max(0, itemsSubtotal - sale.amount);
  return {
    saleDate: sale.saleDate,
    receiptNumber: `FAHME-${String(index + 1).padStart(3, '0')}`,
    total_amount: sale.amount,
    discount,
    items,
  };
});

const payments = settlementAmounts.map((amount, index) => {
  const fallback = settlementFallbacks[index];
  if (fallback) {
    return {
      amount,
      payment_date: `${dmySlashToIso(fallback.date)}T00:00:00.000Z`,
      payment_type: toPaymentType(fallback.paymentType),
      reference: String(index + 1),
      notes: fallback.description || null,
      currency: 'USD',
    };
  }
  return {
    amount,
    payment_date: '2026-07-29T00:00:00.000Z',
    payment_type: 'cash',
    reference: String(index + 1),
    notes: 'Statement settlement (Jul 2026 PDF)',
    currency: 'USD',
  };
});

const depositTotal = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
const expected = {
  customerId: 'd8e756ae-b8ea-4f90-b99a-70c1120f52b9',
  customerName: 'Mohammad Fahme',
  currency: 'USD',
  referencePdf: 'Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf',
  totals: {
    totalSale,
    totalDeposit: depositTotal,
    totalDue: dueRemaining,
  },
  sales,
  payments,
};

const outPath = path.join(__dirname, '../docs/reference/fahme-primary/expected-statement.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(expected, null, 2)}\n`);

console.log('Wrote', outPath);
console.log('Sales:', sales.length, 'Payments:', payments.length);
console.log('Totals:', expected.totals);
if (Math.abs(depositTotal + dueRemaining - totalSale) > 0.01) {
  throw new Error(`Totals mismatch: ${depositTotal} + ${dueRemaining} != ${totalSale}`);
}
