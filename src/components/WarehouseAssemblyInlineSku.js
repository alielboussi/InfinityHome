import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { patchWarehouseAssemblyFields } from '../services/warehouseCatalog';
import { normalizeWarehouseProductSku } from '../utils/warehouseScanResolver';

export default function WarehouseAssemblyInlineSku({
  assembly,
  canEdit,
  onUpdated,
  onError,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => String(assembly?.family_sku || ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) setDraft(String(assembly?.family_sku || ''));
  }, [assembly?.family_sku, open]);

  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, saving]);

  const close = useCallback(() => {
    if (saving) return;
    setOpen(false);
  }, [saving]);

  const saveSku = useCallback(async () => {
    if (!canEdit || !assembly?.id || saving) return;
    const normalized = normalizeWarehouseProductSku(draft);
    const current = normalizeWarehouseProductSku(assembly?.family_sku);
    if (normalized === current) {
      close();
      return;
    }
    if (!normalized) {
      onError?.('SKU is required');
      return;
    }
    setSaving(true);
    try {
      const patch = await patchWarehouseAssemblyFields(assembly.id, {
        family_sku: normalized,
      });
      const saved = patch.family_sku || normalized;
      onUpdated?.(assembly.id, { family_sku: saved });
      setOpen(false);
    } catch (err) {
      onError?.(err?.message || 'Failed to save SKU');
    } finally {
      setSaving(false);
    }
  }, [assembly?.family_sku, assembly?.id, canEdit, close, draft, onError, onUpdated, saving]);

  const displaySku = assembly?.family_sku || '—';

  return (
    <>
      <span className="warehouse-inline-spec warehouse-inline-spec--sku-readonly">
        <span className="warehouse-inline-spec__label">SKU:</span>
        {canEdit ? (
          <button
            type="button"
            className="warehouse-inline-spec__sku-link"
            onClick={() => setOpen(true)}
            title="Click to edit SKU"
          >
            <code>{displaySku}</code>
          </button>
        ) : (
          <code className="warehouse-inline-spec__sku-code">{displaySku}</code>
        )}
      </span>
      {open && createPortal(
        <div
          className="products-adjust-modal-overlay warehouse-sku-edit-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warehouse-sku-edit-title"
          onClick={(e) => {
            if (e.target.classList.contains('products-adjust-modal-overlay')) close();
          }}
        >
          <div className="products-adjust-modal warehouse-sku-edit-modal">
            <h2 id="warehouse-sku-edit-title" className="products-adjust-modal__title">
              Edit product SKU
            </h2>
            <p className="products-adjust-modal__meta">
              <strong>{assembly?.name}</strong>
            </p>
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label" htmlFor="warehouse-sku-edit-input">
                SKU (Code 128)
              </label>
              <input
                ref={inputRef}
                id="warehouse-sku-edit-input"
                type="text"
                className="products-adjust-modal__control warehouse-sku-edit-modal__input"
                value={draft}
                disabled={saving}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveSku();
                  }
                }}
              />
            </div>
            <div className="warehouse-form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="product-form-btn product-form-btn--primary"
                disabled={saving}
                onClick={saveSku}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="product-form-btn product-form-btn--secondary"
                disabled={saving}
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
