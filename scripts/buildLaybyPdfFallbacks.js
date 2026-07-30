const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEFAULT_INPUTS = [
  'Mohammad_Fahme_Layby_Statement_2026-05-14_ (1).pdf',
  'Mohammad_Fahme_Acc2_Layby_Statement_2026-05-25_USD.pdf',
];

const toIsoDate = (dmy) => {
  const m = /^([0-9]{2})[\.\/]([0-9]{2})[\.\/]([0-9]{4})$/.exec(String(dmy || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const toNumber = (value) => Number(String(value || '0').replace(/,/g, '')) || 0;

const itemRegex = /^(\d+(?:\.\d+)?)\s+(.+?)\s+(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)\s+(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)$/i;
const settlementRegex = /^\(([0-9]{2}\/[0-9]{2}\/[0-9]{4})\)\s*-\s*(.*?)\s+(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)\s*$/i;
const settlementSimpleRegex = /^\(([0-9]{2}\/[0-9]{2}\/[0-9]{4})\)\s*-\s*(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)\s*$/i;

async function loadPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return String(parsed.text || '');
  } catch {
    const pdf = require('pypdf');
    throw new Error('Install pdf-parse or run with Python helper');
  }
}

function normalizeLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line.toLowerCase() !== 'best rest furniture');
}

async function parsePdf(filePath) {
  const text = await loadPdfText(filePath);
  const lines = normalizeLines(text);

  const customerLine = lines.find((line) => /^Customer:/i.test(line));
  const customerName = (customerLine || '').replace(/^Customer:\s*/i, '').trim();
  if (!customerName) {
    throw new Error(`Could not detect customer name in ${path.basename(filePath)}`);
  }

  const sections = [];
  const settlements = [];
  let current = null;
  let inSettlement = false;

  const pushCurrent = () => {
    if (!current) return;
    if (current.items.length) sections.push(current);
    current = null;
  };

  for (const line of lines) {
    if (/^Settlement$/i.test(line)) {
      pushCurrent();
      inSettlement = true;
      continue;
    }
    if (/^Terms\s*&\s*Conditions$/i.test(line) || /^Page\s+[0-9]+\s+of\s+[0-9]+$/i.test(line)) {
      inSettlement = false;
      pushCurrent();
      continue;
    }

    if (inSettlement) {
      if (/^Due Remaining/i.test(line)) continue;
      const full = settlementRegex.exec(line);
      if (full) {
        const date = full[1];
        let tail = String(full[2] || '').trim();
        const amount = toNumber(full[3]);
        const typeOnly = /^(Cash|Goods|Bank Transfer|Mobile Money|Cheque|Visa Card)$/i.exec(tail);
        const typeSuffix = /\s-\s*(Cash|Goods|Bank Transfer|Mobile Money|Cheque|Visa Card)$/i.exec(tail);
        const paymentType = typeOnly ? typeOnly[1] : (typeSuffix ? typeSuffix[1] : 'Cash');
        const description = typeOnly
          ? ''
          : (typeSuffix ? tail.replace(typeSuffix[0], '').trim() : tail);
        settlements.push({ date, description, paymentType, amount });
        continue;
      }
      const simple = settlementSimpleRegex.exec(line);
      if (simple) {
        settlements.push({ date: simple[1], description: '', paymentType: 'Cash', amount: toNumber(simple[2]) });
      }
      continue;
    }

    if (/^Date:\s*[0-9]{2}[\.\/][0-9]{2}[\.\/][0-9]{4}/i.test(line)) {
      pushCurrent();
      const dmy = line.replace(/^Date:\s*/i, '').replace(/\s*\(cont\.\)\s*$/i, '').trim();
      current = { dmy, isoDate: toIsoDate(dmy), discount: 0, items: [] };
      continue;
    }

    if (!current) continue;

    if (/^Discount\s+-?(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)/i.test(line)) {
      const m = /^Discount\s+-?(?:USD|\$)\s*([0-9,]+(?:\.[0-9]+)?)/i.exec(line);
      current.discount = toNumber(m?.[1]);
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
    settlements,
  };
}

(async () => {
  const cliInputs = process.argv.slice(2).filter((arg) => arg.toLowerCase().endsWith('.pdf'));
  const inputs = cliInputs.length ? cliInputs : DEFAULT_INPUTS;

  const itemOut = {};
  const settlementOut = {};

  for (const file of inputs) {
    const fullPath = path.isAbsolute(file) ? file : path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Skip missing PDF: ${fullPath}`);
      continue;
    }
    const parsed = await parsePdf(fullPath);
    const key = parsed.customerName.trim().toLowerCase();
    itemOut[key] = parsed.sections.map(({ dmy, isoDate, discount, items }) => ({
      dmy,
      isoDate,
      ...(discount > 0 ? { discount } : {}),
      items,
    }));
    if (parsed.settlements.length) {
      settlementOut[key] = parsed.settlements;
    }
    console.log(`Parsed ${path.basename(fullPath)}: ${parsed.sections.length} item sections, ${parsed.settlements.length} settlement rows`);
  }

  const itemPath = path.join(ROOT, 'src', 'data', 'laybyPdfItemFallbacks.json');
  const settlementPath = path.join(ROOT, 'src', 'data', 'laybyPdfSettlementFallbacks.json');
  fs.mkdirSync(path.dirname(itemPath), { recursive: true });
  fs.writeFileSync(itemPath, `${JSON.stringify(itemOut, null, 2)}\n`);
  if (Object.keys(settlementOut).length) {
    const existing = fs.existsSync(settlementPath)
      ? JSON.parse(fs.readFileSync(settlementPath, 'utf8'))
      : {};
    fs.writeFileSync(settlementPath, `${JSON.stringify({ ...existing, ...settlementOut }, null, 2)}\n`);
    console.log(`Wrote ${settlementPath}`);
  }
  console.log(`Wrote ${itemPath}`);
})();
