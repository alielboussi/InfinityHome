import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function WarehouseCatalogViewToggle({ 'aria-labelledby': ariaLabelledBy } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isPackets = path.startsWith('/warehouse-products/packets');
  const isSets = path.startsWith('/warehouse-products/sets');
  const isIncomplete = path.startsWith('/warehouse-products/incomplete');
  const isUncategorized = path.startsWith('/warehouse-products/uncategorized');
  const isSalesStorage = path.startsWith('/warehouse-products/sales-storage');
  const isProducts = !isPackets && !isSets && !isIncomplete && !isUncategorized && !isSalesStorage;

  return (
    <div
      className="warehouse-catalog-view-toggle warehouse-catalog-view-toggle--compact"
      role="group"
      aria-label={ariaLabelledBy ? undefined : 'Warehouse catalog view'}
      aria-labelledby={ariaLabelledBy || undefined}
    >
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isProducts ? ' is-active' : ''}`}
        aria-pressed={isProducts}
        onClick={() => navigate('/warehouse-products')}
      >
        Products
      </button>
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isSets ? ' is-active' : ''}`}
        aria-pressed={isSets}
        onClick={() => navigate('/warehouse-products/sets')}
      >
        Sets
      </button>
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isPackets ? ' is-active' : ''}`}
        aria-pressed={isPackets}
        onClick={() => navigate('/warehouse-products/packets')}
      >
        Packets
      </button>
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isIncomplete ? ' is-active' : ''}`}
        aria-pressed={isIncomplete}
        onClick={() => navigate('/warehouse-products/incomplete')}
      >
        Incomplete
      </button>
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isUncategorized ? ' is-active' : ''}`}
        aria-pressed={isUncategorized}
        onClick={() => navigate('/warehouse-products/uncategorized')}
      >
        Uncategorized
      </button>
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${isSalesStorage ? ' is-active' : ''}`}
        aria-pressed={isSalesStorage}
        onClick={() => navigate('/warehouse-products/sales-storage')}
      >
        Sales Storage
      </button>
    </div>
  );
}
