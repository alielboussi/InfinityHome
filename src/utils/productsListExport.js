import * as XLSX from 'xlsx';

const EXCLUDED_LOCATION_ID = '20abb7a3-9df9-45bd-885e-6440503ea728';

export function exportProductsListExcel({
  items,
  locations,
  getStockForProduct,
  computeComboMaxQty,
  filename,
}) {
  const exportLocations = (locations || []).filter(
    (loc) => String(loc.id) !== EXCLUDED_LOCATION_ID
  );
  const headers = [
    'SKU',
    'Product Name',
    'Standard Price',
    'Promo Price',
    ...exportLocations.map((loc) => String(loc.name || '').trim()),
  ];

  const sheetRows = [
    headers,
    ...(items || []).map((item) => {
      const isCombo = !!item.__isCombo;
      const name = isCombo ? (item.combo_name || '') : (item.name || '');
      const sku = item.sku || '';
      const standardPrice = isCombo
        ? Number(item.combo_price || item.standard_price || 0)
        : Number(item.price || 0);
      const promoRaw = Number(item.promotional_price || 0);
      const promoPrice = Number.isFinite(promoRaw) && promoRaw > 0 ? promoRaw : '';
      const locationQtys = exportLocations.map((loc) => {
        const qty = isCombo
          ? computeComboMaxQty(item.id, loc.id)
          : getStockForProduct(item.id, loc.id);
        return Number(qty || 0);
      });
      return [sku, name, standardPrice, promoPrice, ...locationQtys];
    }),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 36 },
    { wch: 14 },
    { wch: 14 },
    ...exportLocations.map(() => ({ wch: 12 })),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  XLSX.writeFile(workbook, filename);
}
