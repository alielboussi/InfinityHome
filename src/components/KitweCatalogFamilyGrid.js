import React from 'react';
import { createPortal } from 'react-dom';
import { pickKitweCatalogProductImageUrl } from '../utils/kitweCatalogFamilyCardImage';

/**
 * Production catalog — one horizontal row per product (photo + SKU + name + meta + actions).
 */
export default function KitweCatalogFamilyGrid({
  groups,
  inlayFamilyKey,
  onInlayFamilyKeyChange,
  emptyHint = 'No products in catalog yet.',
  inlayIntro,
  renderInlayContent,
  imageLookup = null,
  title = 'Catalog',
  detailColumnLabel = 'Details',
  renderRowMeta,
  rowActionLabel = 'Open',
}) {
  const inlayGroup = (groups || []).find((g) => g.key === inlayFamilyKey) || null;

  const openInlay = (group) => {
    if (group?.key) onInlayFamilyKeyChange(group.key);
  };

  return (
    <>
      <h2 style={{ fontSize: '1.1rem', marginTop: 24, padding: '0 10px' }}>{title}</h2>
      {(groups || []).length ? (
        <div className="kitwe-catalog-table-wrap" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--kitwe-muted, #64748b)', margin: '0 0 12px', padding: '0 10px' }}>
            Search filters this list. Use {rowActionLabel} to edit BOM and catalog links.
          </p>
          <div className="kitwe-catalog-product-rows" role="list">
            <div className="kitwe-catalog-product-rows__header" aria-hidden>
              <span>Photo</span>
              <span>SKU</span>
              <span>Product</span>
              <span>{detailColumnLabel}</span>
              <span>Actions</span>
            </div>
            {(groups || []).map((group) => {
              const row = (group.items || [])[0];
              if (!row) return null;
              const imageUrl = pickKitweCatalogProductImageUrl(row, imageLookup);
              const name = group.familyBase || row.name || '—';
              const sku = row.family_sku || '—';
              return (
                <article
                  key={group.key}
                  className="kitwe-catalog-product-row"
                  role="listitem"
                >
                  <button
                    type="button"
                    className="kitwe-catalog-product-row__thumb"
                    onClick={() => openInlay(group)}
                    aria-label={`${rowActionLabel} ${name}`}
                  >
                    {imageUrl ? (
                      <img src={imageUrl} alt="" />
                    ) : (
                      <span className="kitwe-catalog-product-row__thumb-placeholder" aria-hidden>▦</span>
                    )}
                  </button>
                  <div className="kitwe-catalog-product-row__sku">{sku}</div>
                  <div className="kitwe-catalog-product-row__name">
                    <strong>{name}</strong>
                  </div>
                  <div className="kitwe-catalog-product-row__meta">
                    {typeof renderRowMeta === 'function' ? renderRowMeta(row) : '—'}
                  </div>
                  <div className="kitwe-catalog-product-row__actions">
                    <button
                      type="button"
                      className="kitwe-btn-secondary kitwe-btn-compact"
                      onClick={() => openInlay(group)}
                    >
                      {rowActionLabel}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="kitwe-empty-hint" style={{ marginTop: 16 }}>{emptyHint}</p>
      )}

      {inlayGroup && typeof document !== 'undefined' && typeof renderInlayContent === 'function'
        ? createPortal(
          <div
            className="floor2-inlay-backdrop"
            role="presentation"
            onClick={() => onInlayFamilyKeyChange('')}
          >
            <div
              className="floor2-inlay-panel kitwe-catalog-inlay-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="kitwe-catalog-inlay-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="floor2-inlay-panel__head">
                <h3 id="kitwe-catalog-inlay-title">{inlayGroup.familyBase}</h3>
                <button
                  type="button"
                  className="kitwe-btn-secondary kitwe-btn-compact"
                  onClick={() => onInlayFamilyKeyChange('')}
                >
                  Close
                </button>
              </div>
              {inlayIntro ? (
                <p className="floor2-inlay-panel__sub">{inlayIntro}</p>
              ) : null}
              {renderInlayContent(inlayGroup)}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
