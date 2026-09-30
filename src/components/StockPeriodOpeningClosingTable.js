import React, { useMemo } from 'react';
import { mergeOpeningClosingAggregationRows } from '../utils/stocktakePeriodStockTable';

export default function StockPeriodOpeningClosingTable({
  openingAggregation = [],
  closingAggregation = [],
  title = 'Opening & closing stock (aggregation)',
}) {
  const rows = useMemo(
    () => mergeOpeningClosingAggregationRows(openingAggregation, closingAggregation),
    [openingAggregation, closingAggregation],
  );

  if (!rows.length) return null;

  return (
    <>
      <div className="stock-periods-section-title" style={{ marginTop: 16 }}>{title}</div>
      <div className="stock-periods-note" style={{ marginBottom: 8 }}>
        Sets rolled up from component quantities — same basis as opening/closing PDFs.
      </div>
      <table className="pos-table stock-periods-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Product / Set</th>
            <th>SKU</th>
            <th>Opening stock qty</th>
            <th>Closing stock qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.sku}-${r.name}`}>
              <td style={{ textAlign: 'left' }}>{r.name}</td>
              <td>{r.sku || '—'}</td>
              <td>{r.opening_qty}</td>
              <td>{r.closing_qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
