import fs from 'fs';

const pdfPath = process.argv[2] || 'c:/Users/aliel/Downloads/Mohammad_Fahme_Layby_Statement_2026-07-29_USD.pdf';
const raw = fs.readFileSync(pdfPath).toString('latin1');

const strings = [...raw.matchAll(/\(([^\\)]+)\)/g)].map((m) => m[1]).filter((s) => s.length > 0);

function parseMoney(value) {
  const n = Number(String(value || '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const sections = [];
let current = null;
for (let i = 0; i < strings.length; i += 1) {
  const token = strings[i];
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

const parsed = sections.map((section) => {
  const tokens = section.tokens;
  let sectionTotal = null;
  let runningDue = null;
  let discount = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === 'Discount' && tokens[i + 1] && /^-?\$/.test(tokens[i + 1])) {
      discount = Math.abs(parseMoney(tokens[i + 1]) || 0);
    }
    if (tokens[i] === 'Total Due' && tokens[i + 1]) {
      runningDue = parseMoney(tokens[i + 1]);
    }
    if (/^\$ [0-9,]+$/.test(tokens[i]) && i > 0 && tokens[i - 1] !== 'Price' && tokens[i - 1] !== 'Amount') {
      sectionTotal = parseMoney(tokens[i]);
    }
  }
  return {
    dmy: section.dmy,
    sectionTotal,
    discount,
    netSection: sectionTotal != null ? Math.max(0, sectionTotal - discount) : null,
    runningDue,
  };
});

console.log('Parsed sale sections:', parsed.length);
parsed.forEach((row, index) => {
  console.log(`${index + 1}. ${row.dmy} section=${row.sectionTotal} discount=${row.discount} net=${row.netSection} due=${row.runningDue}`);
});

const settlementStart = strings.indexOf('Settlement');
const settlementTokens = settlementStart >= 0 ? strings.slice(settlementStart, settlementStart + 80) : [];
const settlementAmounts = settlementTokens
  .filter((token) => /^\$ [0-9,]+$/.test(token))
  .map((token) => parseMoney(token))
  .filter((value) => value != null);

console.log('\nSettlement amounts:', settlementAmounts);
console.log('Settlement sum:', settlementAmounts.reduce((sum, value) => sum + value, 0));

const last = parsed[parsed.length - 1];
if (last?.runningDue != null && settlementAmounts.length) {
  console.log('\nSummary from PDF parser:');
  console.log('  totalSale (last running due):', last.runningDue);
  console.log('  totalDeposit:', settlementAmounts.reduce((sum, value) => sum + value, 0));
  console.log('  totalDue:', last.runningDue - settlementAmounts.reduce((sum, value) => sum + value, 0));
}
