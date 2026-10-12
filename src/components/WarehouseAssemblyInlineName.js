import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { patchWarehouseAssemblyFields } from '../services/warehouseCatalog';

export default function WarehouseAssemblyInlineName({
  assembly,
  canEdit,
  onUpdated,
  onError,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => String(assembly?.name || ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) setDraft(String(assembly?.name || ''));
  }, [assembly?.name, open]);

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

  const saveName = useCallback(async () => {
    if (!canEdit || !assembly?.id || saving) return;
    const trimmed = draft.trim();
    const current = String(assembly?.name || '').trim();
    if (trimmed === current) {
      close();
      return;
    }
    if (!trimmed) {
      onError?.('Product name is required');
      return;
    }
    setSaving(true);
    try {
      const patch = await patchWarehouseAssemblyFields(assembly.id, { name: trimmed });
      const saved = patch.name || trimmed;
      onUpdated?.(assembly.id, { name: saved });
      setOpen(false);
    } catch (err) {
      onError?.(err?.message || 'Failed to save name');
    } finally {
      setSaving(false);
    }
  }, [assembly?.id, assembly?.name, canEdit, close, draft, onError, onUpdated, saving]);

  const displayName = assembly?.name || '—';

  if (!canEdit) {
    return <strong className="warehouse-assembly-card__title">{displayName}</strong>;
  }

  return (
    <>
      <button
        type="button"
        className="warehouse-assembly-card__title warehouse-assembly-card__title-link"
        onClick={() => setOpen(true)}
        title="Click to edit product name"
      >
        {displayName}
      </button>
      {open && createPortal(
        <div
          className="products-adjust-modal-overlay warehouse-sku-edit-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="warehouse-name-edit-title"
          onClick={(e) => {
            if (e.target.classList.contains('products-adjust-modal-overlay')) close();
          }}
        >
          <div className="products-adjust-modal warehouse-sku-edit-modal">
            <h2 id="warehouse-name-edit-title" className="products-adjust-modal__title">
              Edit product name
            </h2>
            <p className="products-adjust-modal__meta">
              SKU: <code>{assembly?.family_sku || '—'}</code>
            </p>
            <div className="products-adjust-modal__row">
              <label className="products-adjust-modal__label" htmlFor="warehouse-name-edit-input">
                Name
              </label>
              <input
                ref={inputRef}
                id="warehouse-name-edit-input"
                type="text"
                className="products-adjust-modal__control warehouse-sku-edit-modal__input"
                value={draft}
                disabled={saving}
                autoCorrect="off"
                spellCheck={true}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveName();
                  }
                }}
              />
            </div>
            <div className="warehouse-form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="product-form-btn product-form-btn--primary"
                disabled={saving}
                onClick={saveName}
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
