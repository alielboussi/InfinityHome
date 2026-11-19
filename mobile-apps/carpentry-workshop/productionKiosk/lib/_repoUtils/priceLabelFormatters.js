export function normalizeLabelQty(qty) {
  return Math.max(1, parseInt(String(qty).replace(/[^\d]/g, ''), 10) || 1);
}

export function formatLabelCurrency(v) {
  return v === null || v === undefined || v === '' ? '' : `K ${Number(v).toLocaleString()}`;
}

export function formatLabelDisplayPrice(value, currency) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const c = String(currency || '').toUpperCase();
  const sym = c === 'USD' || c === '$' ? '$' : 'K';
  return `${sym} ${Math.round(num).toLocaleString('en-US')}`;
}

export function formatLabelPromoDisplay(standard, promo, currency) {
  const promoNum = Number(promo);
  const standardNum = Number(standard);
  if (!Number.isFinite(promoNum) || promoNum <= 0) return '—';
  if (Number.isFinite(standardNum) && promoNum >= standardNum) return '—';
  return formatLabelDisplayPrice(promo, currency);
}

export function labelHasActivePromo(standard, promo) {
  const promoNum = Number(promo);
  const standardNum = Number(standard);
  return Number.isFinite(promoNum) && promoNum > 0
    && (!Number.isFinite(standardNum) || promoNum < standardNum);
}

export function getLabelDiscountPercent(oldP, promoP) {
  if (!oldP || !promoP) return null;
  const percent = Math.round((1 - promoP / oldP) * 100);
  return percent > 0 ? percent : null;
}

export function normalizeCatalogNameForLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildLabelPairsFromSelection(selectedInAddOrder) {
  const expanded = (selectedInAddOrder || []).flatMap((s) => (
    Array(normalizeLabelQty(s.qty)).fill(s)
  ));
  const pairs = [];
  for (let i = 0; i < expanded.length; i += 2) pairs.push([expanded[i], expanded[i + 1] || null]);
  return { expanded, pairs };
}