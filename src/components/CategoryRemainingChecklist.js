import React, { useEffect, useMemo, useState } from 'react';
import { collectCategoryProductComponents } from '../utils/warehouseCategoryComponentMatch';

/**
 * Category picker + checklist panel for Upholstery, Carpentry, and Warehouse Floor 2.
 */
function CategoryRemainingChecklist({
  categories = [],
  candidates = [],
  setCandidates = [],
  existingProductIds,
  onAddSelected,
  busy = false,
  selectPlaceholder = 'Add by category…',
  addButtonLabel = 'Add selected',
  toolbarInline = false,
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const existingSet = useMemo(() => {
    if (existingProductIds instanceof Set) return existingProductIds;
    return new Set((existingProductIds || []).map((id) => String(id)));
  }, [existingProductIds]);

  const selectedCategory = useMemo(
    () => (categories || []).find((c) => String(c.id) === String(selectedCategoryId)) || null,
    [categories, selectedCategoryId],
  );

  const summary = useMemo(() => {
    if (!selectedCategory) return { all: [], existing: [], missing: [] };
    const all = collectCategoryProductComponents({
      category: selectedCategory,
      candidates,
      setCandidates,
    });
    const existing = all.filter((item) => existingSet.has(String(item.id)));
    const missing = all.filter((item) => !existingSet.has(String(item.id)));
    return { all, existing, missing };
  }, [selectedCategory, candidates, setCandidates, existingSet]);

  useEffect(() => {
    if (!selectedCategory) {
      setCheckedIds(new Set());
      return;
    }
    setCheckedIds(new Set(summary.missing.map((item) => String(item.id))));
  }, [selectedCategoryId, selectedCategory, summary.missing]);

  const handleCategoryChange = (e) => {
    const nextId = e.target.value;
    setSelectedCategoryId(nextId);
    setNotice('');
    setError('');
  };

  const toggleId = (id) => {
    const key = String(id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllMissing = () => {
    setCheckedIds(new Set(summary.missing.map((item) => String(item.id))));
  };

  const clearSelection = () => {
    setCheckedIds(new Set());
  };

  const selectedMissingIds = useMemo(
    () => summary.missing.map((item) => String(item.id)).filter((id) => checkedIds.has(id)),
    [summary.missing, checkedIds],
  );

  const handleConfirmAdd = async () => {
    if (!selectedCategory || !selectedMissingIds.length) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const existingCountBefore = summary.existing.length;
      const addedCount = selectedMissingIds.length;
      const catName = selectedCategory.name;
      await onAddSelected(selectedMissingIds);
      setNotice(
        `Category "${catName}": ${existingCountBefore} already existed, added ${addedCount} selected product(s).`,
      );
    } catch (err) {
      setError(err?.message || 'Failed to add selected products');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = busy || submitting;

  const rootClass = toolbarInline
    ? 'kitwe-catalog-category-checklist kitwe-catalog-category-checklist--toolbar-inline'
    : undefined;

  return (
    <div className={rootClass} style={toolbarInline ? undefined : { width: '100%' }}>
      <div
        className={toolbarInline ? 'kitwe-catalog-category-select-row' : undefined}
        style={
          toolbarInline
            ? undefined
            : { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }
        }
      >
        <select
          className="kitwe-search-input carpentry-add-search-input kitwe-catalog-add-toolbar__select"
          value={selectedCategoryId}
          disabled={isBusy}
          onChange={handleCategoryChange}
        >
          <option value="">{selectPlaceholder}</option>
          {(categories || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {selectedCategory ? (
          <button
            type="button"
            className="kitwe-btn-secondary kitwe-btn-compact"
            disabled={isBusy}
            onClick={() => {
              setSelectedCategoryId('');
              setNotice('');
              setError('');
            }}
          >
            Close category
          </button>
        ) : null}
      </div>

      <div className={toolbarInline ? 'kitwe-catalog-category-below' : undefined}>
        {notice ? (
          <p style={{ color: '#0369a1', fontWeight: 600, margin: '10px 0 0' }}>{notice}</p>
        ) : null}
        {error ? (
          <p style={{ color: '#dc2626', fontWeight: 600, margin: '10px 0 0' }}>{error}</p>
        ) : null}

        {selectedCategory ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 10,
              border: '1px solid var(--kitwe-border, #cbd5e1)',
              background: 'var(--kitwe-panel-bg, #f8fafc)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                marginBottom: summary.missing.length ? 10 : 0,
              }}
            >
              <div>
                <strong>{selectedCategory.name}</strong>
                <span style={{ color: 'var(--kitwe-muted, #64748b)', fontSize: 13, marginLeft: 8 }}>
                  {summary.all.length} total · {summary.existing.length} already added ·{' '}
                  <strong>{summary.missing.length} remaining</strong>
                </span>
              </div>

              {summary.missing.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="kitwe-btn-secondary kitwe-btn-compact"
                    disabled={isBusy || selectedMissingIds.length === summary.missing.length}
                    onClick={selectAllMissing}
                  >
                    Select all ({summary.missing.length})
                  </button>
                  <button
                    type="button"
                    className="kitwe-btn-secondary kitwe-btn-compact"
                    disabled={isBusy || selectedMissingIds.length === 0}
                    onClick={clearSelection}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="kitwe-btn-create-set kitwe-btn-compact"
                    disabled={isBusy || selectedMissingIds.length === 0}
                    onClick={handleConfirmAdd}
                  >
                    {submitting
                      ? 'Adding…'
                      : `${addButtonLabel} (${selectedMissingIds.length})`}
                  </button>
                </div>
              ) : null}
            </div>

            {summary.all.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--kitwe-muted, #64748b)', fontSize: 14 }}>
                No Warehouse Floor 1 product components found in category &ldquo;{selectedCategory.name}&rdquo;.
              </p>
            ) : summary.missing.length === 0 ? (
              <p style={{ margin: 0, color: '#0369a1', fontSize: 14, fontWeight: 600 }}>
                All {summary.existing.length} product(s) in &ldquo;{selectedCategory.name}&rdquo; already exist here.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid var(--kitwe-row-border, #e2e8f0)',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                {summary.missing.map((item) => {
                  const isChecked = checkedIds.has(String(item.id));
                  return (
                    <li
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--kitwe-row-border, #e2e8f0)',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          cursor: isBusy ? 'default' : 'pointer',
                          margin: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          className="products-bulk-checkbox"
                          checked={isChecked}
                          disabled={isBusy}
                          onChange={() => toggleId(item.id)}
                        />
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span style={{ color: '#64748b', fontSize: 13 }}>
                          ({item.family_sku || '—'})
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CategoryRemainingChecklist;
