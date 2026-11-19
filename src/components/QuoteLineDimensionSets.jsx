import React from 'react';
import {
  applyQuoteDimensionSetsToLineFields,
  readQuoteDimensionSets,
} from '../utils/quoteProductionItemFields';
import { resolveQuoteLineQuantity } from '../utils/quotationDisplay';

export default function QuoteLineDimensionSets({ item, locked, onPatch }) {
  const qty = resolveQuoteLineQuantity(item?.quantity, item?.unit_price);
  const sets = readQuoteDimensionSets(item, qty);

  const patchSets = (nextSets) => {
    onPatch(applyQuoteDimensionSetsToLineFields(nextSets));
  };

  const updateIndex = (index, field, value) => {
    const next = sets.map((set, i) => (
      i === index ? { ...set, [field]: value } : set
    ));
    patchSets(next);
  };

  return (
    <div className="quotes-line-dimension-sets">
      {sets.map((set, index) => (
        <div key={`${item?.id || 'line'}-dim-${index}`} className="quotes-line-meta-grid quotes-line-meta-grid--carpentry">
          {sets.length > 1 ? (
            <div className="quotes-line-dim-piece-label" style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
              <span className="quotes-line-meta-label">Piece {index + 1}</span>
            </div>
          ) : null}
          <label className="quotes-line-meta-field">
            <span className="quotes-line-meta-label">L (cm)</span>
            <input
              className="quotes-input quotes-input--slim quotes-line-meta-control"
              type="text"
              inputMode="decimal"
              value={set.dim_l_cm || ''}
              disabled={locked}
              onChange={(e) => updateIndex(index, 'dim_l_cm', e.target.value)}
              placeholder="L"
              aria-label={sets.length > 1 ? `Piece ${index + 1} length cm` : 'Length cm optional'}
            />
          </label>
          <label className="quotes-line-meta-field">
            <span className="quotes-line-meta-label">W (cm)</span>
            <input
              className="quotes-input quotes-input--slim quotes-line-meta-control"
              type="text"
              inputMode="decimal"
              value={set.dim_w_cm || ''}
              disabled={locked}
              onChange={(e) => updateIndex(index, 'dim_w_cm', e.target.value)}
              placeholder="W"
              aria-label={sets.length > 1 ? `Piece ${index + 1} width cm` : 'Width cm optional'}
            />
          </label>
          <label className="quotes-line-meta-field">
            <span className="quotes-line-meta-label">H (cm)</span>
            <input
              className="quotes-input quotes-input--slim quotes-line-meta-control"
              type="text"
              inputMode="decimal"
              value={set.dim_h_cm || ''}
              disabled={locked}
              onChange={(e) => updateIndex(index, 'dim_h_cm', e.target.value)}
              placeholder="H"
              aria-label={sets.length > 1 ? `Piece ${index + 1} height cm` : 'Height cm optional'}
            />
          </label>
        </div>
      ))}
    </div>
  );
}