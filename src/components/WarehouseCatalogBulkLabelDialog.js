import React, { useEffect, useMemo, useState } from 'react';
import { paginateList } from './WarehouseCatalogListPager';

const DIALOG_PAGE_SIZE = 10;

export default function WarehouseCatalogBulkLabelDialog({
  open,
  rows,
  onClose,
  onPrint,
  busy,
}) {
  const [qtyById, setQtyById] = useState({});
  const [dialogPage, setDialogPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = {};
    (rows || []).forEach((row) => {
      next[String(row.assemblyId)] = Math.max(0, Math.floor(Number(row.defaultCopies) || 0));
    });
    setQtyById(next);
    setDialogPage(1);
    setError('');
  }, [open, rows]);

  const pagination = useMemo(
    () => paginateList(rows || [], dialogPage, DIALOG_PAGE_SIZE),
    [rows, dialogPage],
  );

  if (!open) return null;

  const close = () => {
    if (busy) return;
    onClose();
  };

  const setQty = (assemblyId, raw) => {
    const n = Math.max(0, Math.floor(Number(String(raw ?? '').trim()) || 0));
    setQtyById((prev) => ({ ...prev, [String(assemblyId)]: n }));
  };

  const handlePrint = async () => {
    const jobs = (rows || [])
      .map((row) => {
        const copies = Math.max(0, Math.floor(Number(qtyById[String(row.assemblyId)]) || 0));
        if (copies < 1) return null;
        return {
          name: row.name,
          sku: row.sku,
          copies,
          color: row.color,
          boxUnitsPerCarton: row.boxUnitsPerCarton,
        };
      })
      .filter(Boolean);
    if (!jobs.length) {
      setError('Set at least one product to quantity 1 or more.');
      return;
    }
    setError('');
    await onPrint(jobs);
  };

  return (
    <div
      className="products-adjust-modal-overlay warehouse-bulk-label-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-bulk-label-dialog-title"
      onClick={(e) => {
        if (e.target.classList.contains('products-adjust-modal-overlay')) close();
      }}
    >
      <div className="products-adjust-modal warehouse-bulk-label-dialog">
        <h2 id="warehouse-bulk-label-dialog-title" className="products-adjust-modal__title">
          Bulk print labels
        </h2>
        <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
          Default quantity is warehouse stock at this location. Adjust copies per product, then print.
        </p>

        <table className="pos-table warehouse-bulk-label-dialog__table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Labels to print</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr><td colSpan={3}>No products selected.</td></tr>
            ) : pagination.items.map((row) => (
              <tr key={row.assemblyId}>
                <td>{row.name}</td>
                <td><code>{row.sku}</code></td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="pos-control pos-compact warehouse-bulk-label-dialog__qty"
                    value={qtyById[String(row.assemblyId)] ?? 0}
                    disabled={busy}
                    onChange={(e) => setQty(row.assemblyId, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pagination.pageCount > 1 ? (
          <div className="warehouse-catalog-pager warehouse-bulk-label-dialog__pager">
            <button
              type="button"
              className="warehouse-catalog-pager__btn"
              disabled={busy || pagination.page <= 1}
              onClick={() => setDialogPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="warehouse-catalog-pager__meta">
              Page {pagination.page} of {pagination.pageCount}
              {' · '}
              {pagination.total} products
            </span>
            <button
              type="button"
              className="warehouse-catalog-pager__btn"
              disabled={busy || pagination.page >= pagination.pageCount}
              onClick={() => setDialogPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}

        {error ? <p className="warehouse-label-print-modal__error" role="alert">{error}</p> : null}

        <div className="products-adjust-modal__actions warehouse-label-print-modal__actions">
          <button
            type="button"
            className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
            onClick={handlePrint}
            disabled={busy || !(rows || []).length}
          >
            {busy ? 'Printing…' : 'Print labels'}
          </button>
          <button type="button" className="warehouse-card-btn" onClick={close} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
