import React, { useCallback, useRef, useState } from 'react';
import {
  resolveWarehouseLabelFromText,
  WAREHOUSE_LABEL_SCAN_MODE,
} from '../utils/warehouseLabelScanResolve';
import { LABEL_NAME_MEMORY_KIND } from '../utils/warehouseLabelOcrName';
import { pickLabelNameForSku } from '../utils/warehouseLabelNameMemory';

const MODE_LABELS = {
  [WAREHOUSE_LABEL_SCAN_MODE.PACKET_CARTON]: 'Import packet label image',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_BOM_FAMILY]: 'Import BOM unit label image',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_HEADER]: 'Import finished label image',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_NUMERIC]: 'Import numeric barcode label',
  [WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO]: 'Import finished product label',
};

async function detectBarcodesFromImageFile(file) {
  if (!file || typeof window === 'undefined') return [];
  if (!('BarcodeDetector' in window)) return [];
  const detector = new window.BarcodeDetector({
    formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'data_matrix'],
  });
  const bitmap = await createImageBitmap(file);
  const codes = await detector.detect(bitmap);
  bitmap.close?.();
  return (codes || []).map((c) => String(c.rawValue || '').trim()).filter(Boolean);
}

/**
 * @param {{
 *   mode: string,
 *   onResolved: (payload: { sku: string, name?: string, nameSource?: string }) => void,
 *   disabled?: boolean,
 *   resolveOptions?: { target?: string },
 *   buttonLabel?: string,
 * }} props
 */
export default function WarehouseLabelImageImport({
  mode,
  onResolved,
  disabled = false,
  resolveOptions = {},
  buttonLabel,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pasteText, setPasteText] = useState('');

  const resolveText = useCallback((text) => {
    const result = resolveWarehouseLabelFromText(text, mode, resolveOptions);
    if (!result.sku) {
      setMessage('Could not resolve a SKU. Paste barcode text from the label below.');
      return;
    }
    const kind = result.nameIntent === 'packet'
      ? LABEL_NAME_MEMORY_KIND.PACKET
      : LABEL_NAME_MEMORY_KIND.PRODUCT_TURKISH;
    const { name, nameSource } = pickLabelNameForSku({
      sku: result.sku,
      kind,
      suggestedName: result.suggestedName,
    });
    const preview = name ? `${result.sku} — ${name}` : result.sku;
    setMessage(
      nameSource === 'remembered'
        ? `Using your saved name for ${preview}`
        : `Resolved: ${preview}`,
    );
    onResolved?.({
      sku: result.sku,
      ...(name ? { name } : {}),
      ...(nameSource ? { nameSource } : {}),
    });
  }, [mode, onResolved, resolveOptions]);

  const onFile = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;
    setBusy(true);
    setMessage('');
    try {
      const barcodes = await detectBarcodesFromImageFile(file);
      const combined = barcodes.join('\n');
      if (combined) {
        resolveText(combined);
      } else {
        setMessage(
          'No barcodes detected in this browser. Paste all text/barcode strings from the label below.',
        );
      }
    } catch (err) {
      setMessage(err?.message || 'Could not read the image.');
    } finally {
      setBusy(false);
    }
  }, [disabled, resolveText]);

  const label = buttonLabel
    || MODE_LABELS[mode]
    || MODE_LABELS[WAREHOUSE_LABEL_SCAN_MODE.PRODUCT_FINISHED_AUTO];

  return (
    <div className="warehouse-label-import" style={{ marginBottom: 12 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFile}
      />
      <button
        type="button"
        className="product-form-btn product-form-btn--secondary"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Reading…' : label}
      </button>
      <p className="warehouse-field-hint" style={{ marginTop: 8, marginBottom: 8 }}>
        Upload a photo of the full label. Chrome can read barcodes from the image; otherwise paste
        all readable lines from the label below. Edit names on the form and save to remember corrections
        for that SKU on this device.
      </p>
      <textarea
        className="warehouse-label-import-paste"
        rows={4}
        placeholder="Paste barcode strings and product name lines from the label (optional)"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
      />
      <button
        type="button"
        className="product-form-btn product-form-btn--secondary"
        disabled={disabled || busy || !pasteText.trim()}
        onClick={() => resolveText(pasteText)}
      >
        Resolve pasted text
      </button>
      {message ? (
        <p role="status" style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export { WAREHOUSE_LABEL_SCAN_MODE };
