const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const ROOT = process.cwd();
const INPUTS = [
  'Mohammad_Fahme_Layby_Statement_2026-05-14_ (1).pdf',
  'Mohammad_Fahme_Acc2_Layby_Statement_2026-05-25_USD.pdf',
];

const toIsoDate = (dmy) => {
  const m = /^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/.exec(dmy || '');
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const toNumber = (value) => Number(String(value || '0').replace(/,/g, '')) || 0;

const itemRegex = /^(\d+(?:\.\d+)?)\s+(.+?)\s+(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)\s+(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)$/i;

async function parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  const lines = String(parsed.text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line.toLowerCase() !== 'best rest furniture');

  const customerLine = lines.find((line) => /^Customer:/i.test(line));
  const customerName = (customerLine || '').replace(/^Customer:\s*/i, '').trim();
  if (!customerName) {
    throw new Error(`Could not detect customer name in ${path.basename(filePath)}`);
  }

  const sections = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.items.length) sections.push(current);
    current = null;
  };

  for (const line of lines) {
    if (/^Date:\s*[0-9]{2}\.[0-9]{2}\.[0-9]{4}/i.test(line)) {
      pushCurrent();
      const dmy = line.replace(/^Date:\s*/i, '').trim();
      current = { dmy, isoDate: toIsoDate(dmy), items: [] };
      continue;
    }

    if (!current) continue;

    if (/^Settlement$/i.test(line) || /^Terms\s*&\s*Conditions$/i.test(line) || /^Page\s+[0-9]+\s+of\s+[0-9]+$/i.test(line)) {
      pushCurrent();
      continue;
    }

    if (/^(Qty\s+Product\s+Name|Net\b|VAT\b|Total\b|Due\b|Total Due\b)/i.test(line)) {
      continue;
    }

    const colorMatch = /^Color:\s*(.+)$/i.exec(line);
    if (colorMatch && current.items.length) {
      const prev = current.items[current.items.length - 1];
      prev.color = colorMatch[1].trim();
      continue;
    }

    const m = itemRegex.exec(line);
    if (m) {
      current.items.push({
        qty: toNumber(m[1]),
        name: m[2].trim(),
        price: toNumber(m[3]),
        amount: toNumber(m[4]),
        color: null,
      });
    }
  }

  pushCurrent();

  return {
    customerName,
    sections,
  };
}

(async () => {
  const out = {};
  for (const file of INPUTS) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = await parsePdf(fullPath);
    const key = parsed.customerName.trim().toLowerCase();
    out[key] = parsed.sections;
  }

  const outPath = path.join(ROOT, 'src', 'data', 'laybyPdfItemFallbacks.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
})();
