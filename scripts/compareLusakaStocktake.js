/**
 * Compare Lusaka opening stocktake PDF (02 Aug 2026) vs current Firestore inventory.
 * Run: node scripts/compareLusakaStocktake.js
 */
import 'dotenv/config';
import { getFirestore } from '../server/lib/firestoreDb.js';

const LUSAKA_ID = 'f72aa989-3888-4a45-96ed-15dc45b5d399';

// From Stock Count Aggregation PDF — Lusaka, 02 Aug 2026 (49 lines, sum qty 62)
const PDF_LINES = [
  { sku: '#00464', name: 'Alaska Sitting Set L-Shape', qty: 1, type: 'product' },
  { sku: '#0775-1', name: 'Bahamas Bedstead 180*200', qty: 1, type: 'product' },
  { sku: '#00558', name: 'Bianco Compact Tv Stand', qty: 1, type: 'product' },
  { sku: '#00750', name: 'Bubble Mirror 210cm', qty: 1, type: 'product' },
  { sku: '#02174', name: 'Coc Console & Mirror', qty: 1, type: 'product' },
  { sku: '#00190', name: 'Copper Fiber Mattress 180*200', qty: 2, type: 'product' },
  { sku: '#12183', name: 'Corner Bookshelf', qty: 2, type: 'product' },
  { sku: '#01464', name: 'Diamond 3+2+1+1 Sitting Set', qty: 1, type: 'product' },
  { sku: '#00502', name: 'Dragon Bedstead 160*200', qty: 1, type: 'product' },
  { sku: '#00495', name: 'Eton Dining Table + 6 Chairs', qty: 1, type: 'set' },
  { sku: '#00057', name: 'Flowers Bedstead 100*200', qty: 2, type: 'product' },
  { sku: '#00884', name: 'High Class 3+3+1+1 Sitting Set', qty: 1, type: 'product' },
  { sku: '#00242', name: 'Kim Nightstand', qty: 5, type: 'product' },
  { sku: '#01014', name: 'King Puff Storage', qty: 1, type: 'product' },
  { sku: '#00483', name: 'Lamp Shade (m)', qty: 1, type: 'product' },
  { sku: '#00216', name: 'Lines Bedstead 100*200', qty: 2, type: 'product' },
  { sku: '#12202', name: 'Lines Bedstead 160*200', qty: 1, type: 'product' },
  { sku: '#00303', name: 'Liva Bedroom Set With Wardrobe Sliding Door', qty: 1, type: 'set' },
  { sku: '#00220', name: 'Luxe Coffee Table', qty: 1, type: 'product' },
  { sku: '#00226', name: 'Luxor Bunkbed', qty: 1, type: 'product' },
  { sku: '#01503', name: 'Luxury 3+3+1+1 Sitting Set', qty: 1, type: 'product' },
  { sku: '#12207', name: 'Miami Console & Mirror', qty: 1, type: 'product' },
  { sku: '#01006', name: 'Nairobi 3+2+1+1 Sitting Set', qty: 1, type: 'product' },
  { sku: '#12230', name: 'Noble Bedstead 160*200', qty: 1, type: 'product' },
  { sku: '#0555', name: 'Noble Bedstead 180*200', qty: 1, type: 'product' },
  { sku: '#00546', name: 'Oliver Coffee Table', qty: 1, type: 'product' },
  { sku: '#01073', name: 'Olympus Mattress 160*200', qty: 1, type: 'product' },
  { sku: '#12229', name: 'Optimum Mattress 160*200', qty: 2, type: 'product' },
  { sku: '#00082', name: 'Oval Mirror', qty: 1, type: 'product' },
  { sku: '#00564', name: 'Oval Mirror 120*220', qty: 1, type: 'product' },
  { sku: '#00043', name: 'Pyramid Bookshelf', qty: 1, type: 'product' },
  { sku: '#11710', name: 'Recliner 3+2+1+1 Sitting Set', qty: 2, type: 'product' },
  { sku: '#11822', name: 'Rome Bedstead 180*200', qty: 1, type: 'product' },
  { sku: '#00262', name: 'Rome Headboard + Foundation 100*200', qty: 1, type: 'product' },
  { sku: '#8406', name: 'Rose Coffee Table', qty: 1, type: 'product' },
  { sku: '#00247', name: 'Round Table (b)', qty: 1, type: 'product' },
  { sku: '#00842', name: 'Round Table (m)', qty: 1, type: 'product' },
  { sku: '#01258', name: 'Royal Love Chair', qty: 1, type: 'product' },
  { sku: '#00681', name: 'Ruby Bedstead 120*200', qty: 1, type: 'product' },
  { sku: '#00186', name: 'Scorpion Coffee Table', qty: 1, type: 'product' },
  { sku: '#00661', name: 'Silva Night Stand', qty: 1, type: 'product' },
  { sku: '#00456', name: 'Sleep Comfort 100*200', qty: 3, type: 'product' },
  { sku: '#01273', name: 'Sleep Comfort Coconut Layer 160*200', qty: 1, type: 'product' },
  { sku: '#00552', name: 'Sleep Comfort Mattress 180*200', qty: 1, type: 'product' },
  { sku: '#00507', name: 'Sleep Comfort Mattress 180*200 Black', qty: 1, type: 'product' },
  { sku: '#00655', name: 'Snow Flake Compact Tv Stand', qty: 1, type: 'product' },
  { sku: '#00209', name: 'Stripes Bedstead 160*200', qty: 2, type: 'product' },
  { sku: '#8400', name: 'Tree Bookshelf', qty: 1, type: 'product' },
  { sku: '#01246', name: 'Venon Coffee Table', qty: 1, type: 'product' },
];

function normSku(s) {
  return String(s || '').trim().toLowerCase().replace(/^#/, '');
}

async function fetchAll(db, table) {
  const snap = await db.collection(table).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function getMaxSetQty(items, stockByProduct) {
  if (!items?.length) return 0;
  let minQty = Infinity;
  for (const item of items) {
    const need = Number(item.quantity || 0);
    if (need <= 0) continue;
    const have = stockByProduct.get(String(item.product_id)) || 0;
    minQty = Math.min(minQty, Math.floor(have / need));
  }
  return Number.isFinite(minQty) ? minQty : 0;
}

async function main() {
  const db = getFirestore();
  if (!db) {
    console.error('Firestore not configured. Set FIREBASE_SERVICE_ACCOUNT in .env');
    process.exit(1);
  }

  const [products, combos, comboItems, comboLocs, inventory] = await Promise.all([
    fetchAll(db, 'products'),
    fetchAll(db, 'combos'),
    fetchAll(db, 'combo_items'),
    fetchAll(db, 'combo_locations'),
    fetchAll(db, 'inventory'),
  ]);

  const productBySku = new Map();
  products.forEach((p) => {
    const sku = normSku(p.sku);
    if (sku) productBySku.set(sku, p);
  });

  const comboBySku = new Map();
  combos.forEach((c) => {
    const sku = normSku(c.sku);
    if (sku) comboBySku.set(sku, c);
  });

  const lusakaComboIds = new Set(
    comboLocs
      .filter((r) => String(r.location_id) === LUSAKA_ID)
      .map((r) => String(r.combo_id)),
  );

  const stockByProduct = new Map();
  inventory
    .filter((r) => String(r.location) === LUSAKA_ID)
    .forEach((r) => {
      const pid = String(r.product_id);
      stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + Number(r.quantity || 0));
    });

  const setQtyByCombo = new Map();
  lusakaComboIds.forEach((comboId) => {
    const items = comboItems.filter((i) => String(i.combo_id) === comboId);
    setQtyByCombo.set(comboId, getMaxSetQty(items, stockByProduct));
  });

  const extraInFirestore = [];
  stockByProduct.forEach((qty, pid) => {
    if (qty <= 0) return;
    const p = products.find((x) => String(x.id) === pid);
    if (!p) return;
    const sku = normSku(p.sku);
    const inPdf = PDF_LINES.some((line) => {
      if (line.type === 'set') {
        const combo = comboBySku.get(normSku(line.sku));
        if (!combo) return false;
        const items = comboItems.filter((i) => String(i.combo_id) === String(combo.id));
        return items.some((i) => String(i.product_id) === pid);
      }
      return normSku(line.sku) === sku;
    });
    if (!inPdf) {
      extraInFirestore.push({ sku: p.sku, name: p.name, qty });
    }
  });

  console.log('\n=== Lusaka stocktake PDF vs Firestore ===\n');

  const missing = [];
  const mismatch = [];
  const ok = [];

  for (const line of PDF_LINES) {
    const skuKey = normSku(line.sku);
    if (line.type === 'set') {
      const combo = comboBySku.get(skuKey);
      if (!combo) {
        missing.push({ ...line, reason: 'Set SKU not found in combos' });
        continue;
      }
      const items = comboItems.filter((i) => String(i.combo_id) === String(combo.id));
      const setQty = setQtyByCombo.get(String(combo.id)) || 0;
      const compDetail = items.map((i) => {
        const p = products.find((x) => String(x.id) === String(i.product_id));
        return {
          sku: p?.sku,
          name: p?.name,
          need: Number(i.quantity || 0),
          have: stockByProduct.get(String(i.product_id)) || 0,
        };
      });
      if (setQty === line.qty) {
        ok.push({ ...line, setQty, components: compDetail });
      } else {
        mismatch.push({ ...line, expected: line.qty, actualSetQty: setQty, components: compDetail });
      }
      continue;
    }

    const product = productBySku.get(skuKey);
    if (!product) {
      missing.push({ ...line, reason: 'Product SKU not found' });
      continue;
    }
    const have = stockByProduct.get(String(product.id)) || 0;
    if (have === line.qty) {
      ok.push({ ...line, productId: product.id, have });
    } else {
      mismatch.push({ ...line, productId: product.id, expected: line.qty, actual: have });
    }
  }

  console.log(`PDF lines: ${PDF_LINES.length}`);
  console.log(`Match: ${ok.length}`);
  console.log(`Mismatch: ${mismatch.length}`);
  console.log(`Missing SKU in DB: ${missing.length}`);
  console.log(`Extra in Firestore (qty>0, not on PDF): ${extraInFirestore.length}`);

  if (mismatch.length) {
    console.log('\n--- MISMATCHES ---');
    mismatch.forEach((m) => {
      if (m.type === 'set') {
        console.log(`SET ${m.sku} ${m.name}: PDF=${m.expected} portal sets=${m.actualSetQty}`);
        (m.components || []).forEach((c) => {
          console.log(`  component ${c.sku} ${c.name}: need ${c.need}/set, have ${c.have}`);
        });
      } else {
        console.log(`PRODUCT ${m.sku} ${m.name}: PDF=${m.expected} portal=${m.actual}`);
      }
    });
  }

  if (missing.length) {
    console.log('\n--- NOT IN DATABASE ---');
    missing.forEach((m) => console.log(`${m.sku} ${m.name} — ${m.reason || ''}`));
  }

  if (extraInFirestore.length) {
    console.log('\n--- IN PORTAL BUT NOT ON PDF (qty > 0) ---');
    extraInFirestore.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    extraInFirestore.forEach((r) => console.log(`${r.sku} ${r.name}: ${r.qty}`));
  }

  const zeroStockOnPdf = mismatch.filter((m) =>
    m.type === 'set' ? m.actualSetQty === 0 : m.actual === 0,
  );
  if (zeroStockOnPdf.length) {
    console.log(`\n--- PDF items with ZERO stock in portal: ${zeroStockOnPdf.length} ---`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
