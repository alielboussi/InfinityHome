# Sales Storage label (POS → Floor 1)

Physical size: **80 mm × 68 mm** die-cut, **3 mm** gap between labels on the roll (ZPL pitch 71 mm @ default env).

## Layout (top → bottom)

| Zone | Content |
|------|---------|
| Header | **Bestrest Furniture** (centred) |
| Barcode | **Code 128** of SKU (centred, 40×6.5 mm) |
| Rows | Field labels (left) + **center-aligned** values/QR stacked on one vertical axis (inner right margin) |
| | SKU → value |
| | Product Name → up to 2 lines |
| | **Image QR** (product photo URL by SKU) beside name block |
| | Customer Name |
| | Customer # (phone) |
| | Sale Date (`DD / MM / YYYY`, CAT) |
| | Receipt # (when present) |
| | Set: (optional, manual/set flows) |

## Print path

`orders-storage-submit` / `storage-send-submit` → `submitWarehouseStorageSend` → `executeStorageSendLine` → `printWarehouseStorageSaleLabel` → Zebra Weblink (`sendZplToZebraPrinter`) or `label_print_jobs` queue.

ZPL builder: `server/lib/zebraWarehouseStorageSaleLabelZpl.js`  
Preview raster: `server/lib/warehouseStorageSaleLabelImage.js` (10 px/mm → **800×680** PNG)

## Sample asset

Generate or refresh the reference PNG:

```bash
node scripts/renderStorageSaleLabelSample.js
```

Output: `docs/samples/storage-sale-label-sample.png` (exact 80×68 mm at 10 px/mm).

Orders app **Storage** screen: **Preview sample label** / **Print test label** calls `orders-storage-label-test` (deploy API first).
