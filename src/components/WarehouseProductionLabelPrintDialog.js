import React, { useEffect, useState } from 'react';
import { FaTag } from 'react-icons/fa';
import { printWarehouseProductionLabel } from '../services/warehouseProductionApi';

/**
 * @param {{ name: string, sku: string, defaultCopies?: number }} item
 */
export default function WarehouseProductionLabelPrintDialog({
  open,
  item,
  onClose,
}) {
  const name = String(item?.name || '').trim();
  const sku = String(item?.sku || '').trim();
  const color = String(item?.color || '').trim();
  const boxUnitsPerCarton = Math.max(0, Math.floor(Number(item?.boxUnitsPerCarton) || 0));
  const [copies, setCopies] = useState(1);
  const [copiesInput, setCopiesInput] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [previewPng, setPreviewPng] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    const n = Math.max(1, Math.floor(Number(item?.defaultCopies) || 1));
    setCopies(n);
    setCopiesInput(String(n));
    setBusy(false);
    setError('');
    setWarning('');
    setPreviewPng('');
    setDone(false);
  }, [open, item?.defaultCopies, item?.color, name, sku]);

  if (!open) return null;

  const commitCopiesInput = (raw) => {
    const n = Math.max(1, Math.floor(Number(String(raw ?? '').trim()) || 0));
    setCopies(n);
    setCopiesInput(String(n));
    return n;
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  const onPrint = async () => {
    if (!name || !sku || busy) return;
    const printCopies = commitCopiesInput(copiesInput);
    setBusy(true);
    setError('');
    setWarning('');
    try {
      const result = await printWarehouseProductionLabel({
        name, sku, copies: printCopies, color, boxUnitsPerCarton,
      });
      setPreviewPng(result.labelPreviewPngBase64 || '');
      setWarning(String(result.labelPrintWarning || '').trim());
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Label print failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="products-adjust-modal-overlay warehouse-label-print-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-label-print-title"
      onClick={(e) => {
        if (e.target.classList.contains('products-adjust-modal-overlay')) close();
      }}
    >
      <div className="products-adjust-modal warehouse-label-print-modal">
        <h2 id="warehouse-label-print-title" className="products-adjust-modal__title">
          Print warehouse label
        </h2>
        <p className="products-adjust-modal__meta warehouse-label-print-modal__name">{name}</p>
        <p className="warehouse-label-print-modal__sku">
          <code>{sku}</code>
        </p>
        {color ? (
          <p className="warehouse-label-print-modal__color">
            Color: <strong>{color}</strong>
          </p>
        ) : null}

        <div className="warehouse-label-print-modal__qty">
          <span className="products-adjust-modal__label">Label copies</span>
          <div className="warehouse-label-print-modal__qty-controls">
            <button
              type="button"
              className="warehouse-label-print-modal__qty-btn"
              onClick={() => {
                const next = Math.max(1, copies - 1);
                setCopies(next);
                setCopiesInput(String(next));
              }}
              disabled={busy || copies <= 1}
              aria-label="Decrease copies"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="warehouse-label-print-modal__qty-input"
              value={copiesInput}
              disabled={busy}
              aria-label="Label copies"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setCopiesInput(digits);
                if (digits) {
                  setCopies(Math.max(1, Math.floor(Number(digits) || 0)));
                }
              }}
              onBlur={() => commitCopiesInput(copiesInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitCopiesInput(copiesInput);
                }
              }}
            />
            <button
              type="button"
              className="warehouse-label-print-modal__qty-btn"
              onClick={() => {
                const next = copies + 1;
                setCopies(next);
                setCopiesInput(String(next));
              }}
              disabled={busy}
              aria-label="Increase copies"
            >
              +
            </button>
          </div>
        </div>

        {previewPng ? (
          <div className="warehouse-label-print-modal__preview">
            <p className="warehouse-label-print-modal__preview-caption">Preview (actual label size 80 × 68 mm)</p>
            <img
              className="warehouse-label-print-modal__preview-img"
              src={`data:image/png;base64,${previewPng}`}
              alt="Label preview at 80 by 68 millimetres"
            />
          </div>
        ) : null}

        {error ? (
          <p className="warehouse-label-print-modal__error" role="alert">{error}</p>
        ) : null}
        {warning ? (
          <p className="warehouse-label-print-modal__warn" role="status">{warning}</p>
        ) : null}
        {done && !error && !warning ? (
          <p className="warehouse-label-print-modal__ok" role="status">
            Sent {copies} label{copies === 1 ? '' : 's'} to the printer queue.
          </p>
        ) : null}

        <div className="products-adjust-modal__actions warehouse-label-print-modal__actions">
          {!done ? (
            <button
              type="button"
              className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
              onClick={onPrint}
              disabled={busy || !name || !sku}
            >
              {busy ? 'Printing…' : 'Print labels'}
            </button>
          ) : null}
          <button type="button" className="warehouse-card-btn" onClick={close} disabled={busy}>
            {done ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WarehouseLabelPrintIconButton({ onClick, title = 'Print warehouse label', disabled }) {
  return (
    <button
      type="button"
      className="warehouse-label-print-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <FaTag aria-hidden />
    </button>
  );
}
