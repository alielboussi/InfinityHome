import { readFileSync } from 'fs';

function parseMoney(token) {
  return Number(String(token || '').replace(/[$,\s]/g, '')) || 0;
}

/** Parse signed-off Mohammad Fahme primary PDF footer totals. */
export function parseFahmePrimaryPdfFooter(pdfPath) {
  const raw = readFileSync(pdfPath).toString('latin1');
  const strings = [...raw.matchAll(/\(([^\\)]+)\)/g)].map((m) => m[1]);

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
  const sales = sections.map((section) => {
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
    return { dmy: section.dmy, amount, discount, runningDue };
  });

  const settlementStart = strings.indexOf('Settlement');
  const dueIdx = strings.indexOf('Due Remaining');
  const settlementSlice = settlementStart >= 0 && dueIdx > settlementStart
    ? strings.slice(settlementStart, dueIdx)
    : [];
  const payments = settlementSlice
    .filter((token) => /^\$ [0-9,]+$/.test(token))
    .map((token) => parseMoney(token));

  const totalSale = sales[sales.length - 1]?.runningDue || 0;
  const totalDeposit = payments.reduce((sum, value) => sum + value, 0);
  const totalDue = dueIdx >= 0 ? parseMoney(strings[dueIdx + 1]) : Math.max(0, totalSale - totalDeposit);

  return {
    saleCount: sales.length,
    paymentCount: payments.length,
    totalSale,
    totalDeposit,
    totalDue,
    sales,
    payments,
  };
}
