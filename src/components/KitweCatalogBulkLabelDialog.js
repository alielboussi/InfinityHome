import React, { useEffect, useMemo, useState } from 'react';
import { paginateList } from './WarehouseCatalogListPager';

const DIALOG_PAGE_SIZE = 10;

export default function KitweCatalogBulkLabelDialog({
  open,
  rows,
  onClose,
  onQueue,
  busy,
}) {
  const [qtyByKey, setQtyByKey] = useState({});
  const [stdOnlyByKey, setStdOnlyByKey] = useState({});
  const [dialogPage, setDialogPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const qtyNext = {};
    const stdNext = {};
    (rows || []).forEach((row) => {
      const key = String(row.key);
      qtyNext[key] = Math.max(1, Math.floor(Number(row.defaultQty) || 1));
      stdNext[key] = Boolean(row.printStandardOnly);
    });
    setQtyByKey(qtyNext);
    setStdOnlyByKey(stdNext);
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

  const setQty = (key, raw) => {
    const n = Math.max(0, Math.floor(Number(String(raw ?? '').trim()) || 0));
    setQtyByKey((prev) => ({ ...prev, [String(key)]: n }));
  };

  const toggleStdOnly = (key) => {
    setStdOnlyByKey((prev) => ({ ...prev, [String(key)]: !prev[String(key)] }));
  };

  const handleQueue = async () => {
    const jobs = (rows || [])
      .map((row) => {
        const key = String(row.key);
        const copies = Math.max(0, Math.floor(Number(qtyByKey[key]) || 0));
        if (copies < 1) return null;
        return {
          key,
          retailProductId: String(row.retailProductId || ''),
          qty: copies,
          printStandardOnly: Boolean(stdOnlyByKey[key]),
        };
      })
      .filter(Boolean);
    if (!jobs.length) {
      setError('Set at least one row to quantity 1 or more.');
      return;
    }
    setError('');
    await onQueue(jobs);
  };

  return (
    <div
      className="products-adjust-modal-overlay warehouse-bulk-label-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitwe-bulk-label-dialog-title"
      onClick={(e) => {
        if (e.target.classList.contains('products-adjust-modal-overlay')) close();
      }}
    >
      <div className="products-adjust-modal warehouse-bulk-label-dialog">
        <h2 id="kitwe-bulk-label-dialog-title" className="products-adjust-modal__title">
          Bulk price labels
        </h2>
        <p className="warehouse-field-hint" style={{ marginTop: 0 }}>
          Choose how many labels per item. Tick &quot;Std price&quot; to print standard price only (ignore promo when one exists).
        </p>

        <table className="pos-table warehouse-bulk-label-dialog__table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Labels</th>
              <th>Std price only</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.length === 0 ? (
              <tr><td colSpan={4}>No rows selected.</td></tr>
            ) : pagination.items.map((row) => {
              const key = String(row.key);
              return (
                <tr key={key}>
                  <td>
                    {row.name}
                    {row.kind === 'set' ? <span className="kitwe-bulk-label-kind"> Set</span> : null}
                  </td>
                  <td><code>{row.sku || '—'}</code></td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="pos-control pos-compact warehouse-bulk-label-dialog__qty"
                      value={qtyByKey[key] ?? 0}
                      disabled={busy}
                      onChange={(e) => setQty(key, e.target.value)}
                    />
                  </td>
                  <td>
                    <label className="labels-table-standard-only" title="Print at standard price only">
                      <input
                        type="checkbox"
                        className="labels-table-std-checkbox"
                        checked={Boolean(stdOnlyByKey[key])}
                        disabled={busy}
                        onChange={() => toggleStdOnly(key)}
                      />
                      <span>Std price</span>
                    </label>
                  </td>
                </tr>
              );
            })}
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
            onClick={handleQueue}
            disabled={busy || !(rows || []).length}
          >
            {busy ? 'Opening…' : 'Open price labels'}
          </button>
          <button type="button" className="warehouse-card-btn" onClick={close} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
