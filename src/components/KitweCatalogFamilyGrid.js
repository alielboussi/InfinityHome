import React from 'react';
import { createPortal } from 'react-dom';
import { pickKitweCatalogFamilyImageUrl } from '../utils/kitweCatalogFamilyCardImage';

/**
 * Manufacture-style family cards + inlay dialog (same pattern as Warehouse Floor 2 grid).
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
            Click a family card or the Products badge to open lines, BOM, and links.
          </p>
          <div className="floor2-manufacture-grid">
            {(groups || []).map((group) => {
              const imageUrl = pickKitweCatalogFamilyImageUrl(group.items, imageLookup);
              const variantCount = (group.items || []).length;
              const inlayLabel = variantCount === 1 ? '1 Product' : `${variantCount} Products`;
              return (
                <div
                  key={group.key}
                  className={`floor2-manufacture-tile${imageUrl ? ' has-photo' : ''}`}
                >
                  <button
                    type="button"
                    className="floor2-manufacture-tile__photo-hit"
                    onClick={() => openInlay(group)}
                    aria-label={`Open ${group.familyBase}`}
                  >
                    {imageUrl ? (
                      <img className="floor2-manufacture-tile__photo" src={imageUrl} alt="" />
                    ) : (
                      <div className="floor2-manufacture-tile__photo-placeholder" aria-hidden />
                    )}
                    <div className="floor2-manufacture-tile__overlay" aria-hidden />
                    <h3 className="floor2-manufacture-tile__title">{group.familyBase}</h3>
                    {!imageUrl ? (
                      <div className="floor2-manufacture-tile__no-image-center">
                        <span className="floor2-manufacture-tile__no-image-icon" aria-hidden>
                          ▦
                        </span>
                      </div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="floor2-manufacture-tile__inlay"
                    onClick={(e) => {
                      e.stopPropagation();
                      openInlay(group);
                    }}
                    aria-label={`${inlayLabel} — ${group.familyBase}`}
                  >
                    <span className="floor2-manufacture-tile__inlay-icon" aria-hidden>☰</span>
                    {inlayLabel}
                  </button>
                </div>
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
