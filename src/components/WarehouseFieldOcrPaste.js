import React, { useState } from 'react';
import {
  extractWarehouseLabelFieldFromOcr,
  warehouseLabelOcrFieldHint,
  WAREHOUSE_LABEL_OCR_FIELD,
} from '../utils/warehouseLabelFieldOcr';

/**
 * Paste printed label text for one form field (all label types; OCR text only — no barcode decode).
 */
export default function WarehouseFieldOcrPaste({ field, onValue, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');

  const apply = () => {
    const { value, candidates } = extractWarehouseLabelFieldFromOcr(text, field);
    if (value) {
      onValue(value);
      setMessage('');
      setOpen(false);
      setText('');
      return;
    }
    if (candidates.length) {
      onValue(candidates[0]);
      setOpen(false);
      setText('');
      return;
    }
    setMessage('Could not read this field from the pasted text.');
  };

  return (
    <span className="warehouse-field-ocr-paste" style={{ marginLeft: 8 }}>
      <button
        type="button"
        className="product-form-btn product-form-btn--secondary"
        style={{ padding: '2px 8px', fontSize: 12 }}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        📷 OCR text
      </button>
      {open ? (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 8,
          }}
        >
          <p className="warehouse-field-hint" style={{ margin: '0 0 8px' }}>
            {warehouseLabelOcrFieldHint(field)}
          </p>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste printed lines from the label photo"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
          />
          <button
            type="button"
            className="product-form-btn product-form-btn--secondary"
            style={{ marginTop: 8 }}
            disabled={!text.trim()}
            onClick={apply}
          >
            Use for this field
          </button>
          {message ? (
            <p role="alert" style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{message}</p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export { WAREHOUSE_LABEL_OCR_FIELD };
