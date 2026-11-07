import React from 'react';
import { getListItemImageUrl } from './productsListImage';

export { getListItemImageUrl };

export default function ProductsListTableRow({ item, meta, ctx }) {
  const {
    isCombo,
    highlightRow,
    rowKey,
    bulkKey,
    categoryName,
    categoryMissing,
    locationQtyRows,
  } = meta;

  const {
    showDuplicateNamesOnly,
    bulkSelectionMap,
    setBulkSelectionMap,
    canManageCatalogPage,
    handleImageCellClick,
    nameEdit,
    nameInputRef,
    inlineNameDraftRef,
    setNameEdit,
    cancelInlineName,
    saveInlineName,
    setCategoryEditItem,
    setCategorySearch,
    canAdjustInventory,
    openLocationStockCorrection,
    productsListStockMoveDisabledMessage,
    renderEditablePriceCell,
    openItemEditor,
  } = ctx;

  return (
    <tr
      key={isCombo ? `combo-${item.id}` : item.id}
      className={highlightRow ? (showDuplicateNamesOnly ? 'products-list-row--duplicate' : 'products-list-row--negative') : undefined}
      style={!showDuplicateNamesOnly && highlightRow ? { background: '#4d1f1f' } : undefined}
    >
      <td className="products-list-cell-bulk">
        <input
          type="checkbox"
          className="products-bulk-checkbox"
          checked={Object.prototype.hasOwnProperty.call(bulkSelectionMap, bulkKey) ? bulkSelectionMap[bulkKey] : false}
          onChange={(e) => {
            const checked = e.target.checked;
            setBulkSelectionMap((prev) => {
              const next = { ...prev };
              if (checked) next[bulkKey] = true;
              else delete next[bulkKey];
              return next;
            });
          }}
          aria-label={`Select ${isCombo ? item.combo_name : item.name}`}
        />
      </td>
      <td className="products-list-cell-image">
        {(() => {
          const imageUrl = getListItemImageUrl(item);
          const imageAlt = isCombo ? item.combo_name : item.name;
          if (!imageUrl) {
            return (
              <span
                role="button"
                tabIndex={canManageCatalogPage ? 0 : -1}
                className={`products-list-thumb-empty products-list-thumb-empty--clickable${!canManageCatalogPage ? ' is-disabled' : ''}`}
                onClick={() => canManageCatalogPage && handleImageCellClick(item)}
                onKeyDown={(e) => {
                  if (!canManageCatalogPage) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleImageCellClick(item);
                  }
                }}
                aria-label={`Set image for ${imageAlt}`}
              >
                —
              </span>
            );
          }
          return (
            <div
              className="products-list-thumb-wrap products-list-thumb-wrap--editable"
              role="button"
              tabIndex={0}
              onClick={() => handleImageCellClick(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleImageCellClick(item);
                }
              }}
              aria-label={`Edit image for ${imageAlt}`}
            >
              <img
                src={imageUrl}
                alt={imageAlt}
                className="products-list-thumb"
                loading="lazy"
              />
              <div className="products-list-thumb-zoom" aria-hidden="true">
                <img src={imageUrl} alt="" className="products-list-thumb-zoom__img" />
              </div>
            </div>
          );
        })()}
      </td>
      <td className="products-list-cell-name">
        {nameEdit?.rowKey === rowKey ? (
          <input
            ref={nameInputRef}
            type="text"
            className="products-list-inline-name-input"
            value={nameEdit.draft}
            size={Math.max(24, Math.min((nameEdit.draft || '').length + 2, 72))}
            onChange={(e) => {
              inlineNameDraftRef.current = e.target.value;
              setNameEdit((prev) => (prev ? { ...prev, draft: e.target.value } : prev));
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelInlineName();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                await saveInlineName(item, isCombo, inlineNameDraftRef.current);
              }
            }}
            onBlur={() => {
              if (ctx.inlineNameSaveLockRef?.current) return;
              if (!nameEdit || nameEdit.rowKey !== rowKey) return;
              cancelInlineName();
            }}
            title="Press Enter to save, Escape to cancel"
            aria-label={`Edit name for ${isCombo ? item.combo_name : item.name}`}
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={() => {
              if (isCombo) {
                window.location.href = `/edit-set/${item.id}`;
                return;
              }
              if (!canManageCatalogPage) {
                alert('You do not have permission to edit product names.');
                return;
              }
              const draft = item.name || '';
              inlineNameDraftRef.current = draft;
              setNameEdit({
                rowKey,
                draft,
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (isCombo) {
                  window.location.href = `/edit-set/${item.id}`;
                  return;
                }
                if (!canManageCatalogPage) return;
                const draft = item.name || '';
                inlineNameDraftRef.current = draft;
                setNameEdit({
                  rowKey,
                  draft,
                });
              }
            }}
            className="products-list-name-link"
            title={isCombo ? 'Open set editor' : 'Click to edit name'}
          >
            {isCombo ? item.combo_name : item.name}
          </span>
        )}
      </td>
      <td className="products-list-cell-sku">{isCombo ? item.sku : (item.sku || '(auto)')}</td>
      <td className="products-list-cell-category">
        <span
          role="button"
          tabIndex={canManageCatalogPage ? 0 : -1}
          className={`products-list-category-link${!canManageCatalogPage ? ' is-disabled' : ''}`}
          onClick={() => {
            if (!canManageCatalogPage) {
              alert('You do not have permission to edit categories.');
              return;
            }
            setCategoryEditItem({ item, isCombo });
            setCategorySearch('');
          }}
          onKeyDown={(e) => {
            if (!canManageCatalogPage) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCategoryEditItem({ item, isCombo });
              setCategorySearch('');
            }
          }}
        >
          {categoryName || (isCombo ? 'Set' : '-')}
        </span>
        {categoryMissing && (
          <span
            style={{
              marginLeft: '8px',
              padding: '2px 8px',
              borderRadius: '999px',
              background: '#3a1f1f',
              color: '#ffb3b3',
              border: '1px solid #ff6b6b',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Missing category
          </span>
        )}
      </td>
      <td className="products-list-cell-locations">
        {locationQtyRows.length === 0 ? (
          <span className="products-list-location-empty">No locations</span>
        ) : (
          <ul className="products-list-location-qty-list" aria-label={`Stock by location for ${isCombo ? item.combo_name : item.name}`}>
            {locationQtyRows.map((row) => (
              <li key={row.id}>
                {isCombo && canAdjustInventory ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="products-list-location-qty-link"
                    onClick={() => openLocationStockCorrection(item, row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openLocationStockCorrection(item, row);
                      }
                    }}
                    title={`Adjust set stock at ${row.name}`}
                  >
                    {row.name}: {row.qty.toLocaleString()}
                  </span>
                ) : (
                  <span
                    className="products-list-location-qty-plain"
                    title={!isCombo ? productsListStockMoveDisabledMessage() : undefined}
                  >
                    {row.name}: {row.qty.toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </td>
      {renderEditablePriceCell(item, 'price', isCombo, rowKey, 'products-list-cell-price')}
      {renderEditablePriceCell(item, 'promotional_price', isCombo, rowKey, 'products-list-cell-promo')}
      <td className="products-list-cell-action">
        <button
          type="button"
          className="products-list-action-btn products-list-action-btn--edit"
          onClick={() => openItemEditor(item, isCombo)}
          title={isCombo ? `Edit set ${item.combo_name}` : `Edit product ${item.name}`}
          aria-label={isCombo ? `Edit set ${item.combo_name}` : `Edit product ${item.name}`}
        >
          Edit
        </button>
      </td>
    </tr>
  );
}
