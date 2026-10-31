import React, { useEffect, useMemo, useState } from 'react';
import { FaFolderOpen } from 'react-icons/fa';
import {
  findOrCreateWarehouseCategory,
  patchWarehouseAssemblyFields,
} from '../services/warehouseCatalog';

export function WarehouseCategoryIconButton({
  onClick,
  title = 'Assign category',
  disabled,
}) {
  return (
    <button
      type="button"
      className="warehouse-label-print-btn warehouse-category-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <FaFolderOpen aria-hidden />
    </button>
  );
}

export default function WarehouseAssemblyCategoryDialog({
  open,
  assembly,
  categories,
  onClose,
  onCategoriesChange,
  onUpdated,
  onError,
}) {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setNewName('');
    setBusy(false);
    setCreateBusy(false);
  }, [open, assembly?.id]);

  const sortedCategories = useMemo(() => (
    (categories || []).slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
    )
  ), [categories]);

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedCategories;
    return sortedCategories.filter((cat) => String(cat.name || '').toLowerCase().includes(term));
  }, [sortedCategories, search]);

  if (!open || !assembly?.id) return null;

  const close = () => {
    if (busy || createBusy) return;
    onClose?.();
  };

  const assignCategory = async (categoryId) => {
    if (busy || createBusy) return;
    const current = assembly.category_id ? String(assembly.category_id) : '';
    const next = categoryId ? String(categoryId) : '';
    if (current === next) {
      close();
      return;
    }
    setBusy(true);
    try {
      await patchWarehouseAssemblyFields(assembly.id, { category_id: categoryId || null });
      onUpdated?.(assembly.id, { category_id: categoryId || null });
      close();
    } catch (err) {
      onError?.(err?.message || 'Failed to update category');
    } finally {
      setBusy(false);
    }
  };

  const createAndAssign = async () => {
    const trimmed = newName.trim();
    if (!trimmed || createBusy || busy) return;
    setCreateBusy(true);
    try {
      const category = await findOrCreateWarehouseCategory(trimmed);
      onCategoriesChange?.((prev) => {
        const next = [...(prev || []).filter((c) => String(c.id) !== String(category.id)), category];
        next.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return next;
      });
      await patchWarehouseAssemblyFields(assembly.id, { category_id: category.id });
      onUpdated?.(assembly.id, { category_id: category.id });
      setNewName('');
      close();
    } catch (err) {
      onError?.(err?.message || 'Could not create category');
    } finally {
      setCreateBusy(false);
    }
  };

  const selectedId = assembly.category_id ? String(assembly.category_id) : '';

  return (
    <div
      className="products-image-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-category-dialog-title"
      onClick={close}
    >
      <div
        className="products-category-modal products-category-modal--pick-grid"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="warehouse-category-dialog-title" className="products-image-modal__title">
          Product category
        </h3>
        <div className="products-image-modal__meta">
          {assembly.name || '—'}
        </div>
        <p className="products-category-modal__grid-hint">
          Categories A–Z — click one to assign. Use search only if you need to narrow a long list.
        </p>
        <input
          type="search"
          className="products-category-modal__search products-category-modal__search--compact"
          placeholder="Filter categories (optional)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={busy || createBusy}
        />
        <div
          className="products-category-modal__grid"
          role="listbox"
          aria-label="Categories A to Z"
        >
          {filteredCategories.length === 0 ? (
            <p className="products-category-modal__grid-empty">No categories match your filter.</p>
          ) : null}
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`products-category-modal__grid-option${
                selectedId === String(cat.id) ? ' is-selected' : ''
              }`}
              onClick={() => assignCategory(cat.id)}
              disabled={busy || createBusy}
              title={cat.name}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="products-category-modal__create">
          <p className="warehouse-field-hint" style={{ margin: 0 }}>
            New category — type a name, then add and assign to this product.
          </p>
          <div className="warehouse-color-pick-row">
            <input
              type="text"
              className="warehouse-color-pick-input"
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                createAndAssign();
              }}
              disabled={busy || createBusy}
            />
            <button
              type="button"
              className="product-form-btn product-form-btn--secondary warehouse-color-pick-add"
              onClick={createAndAssign}
              disabled={busy || createBusy || !newName.trim()}
            >
              {createBusy ? '…' : 'Add & assign'}
            </button>
          </div>
        </div>
        <div className="products-image-modal__actions">
          <button
            type="button"
            className="products-image-modal__btn products-image-modal__btn--secondary"
            onClick={close}
            disabled={busy || createBusy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
