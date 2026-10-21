import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function WarehouseCatalogViewToggle({ 'aria-labelledby': ariaLabelledBy } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const isPackets = path.startsWith('/warehouse-products/packets');
  const isIncomplete = path.startsWith('/warehouse-products/incomplete');
  const isProducts = !isPackets && !isIncomplete;

  return (
    <div
      className="warehouse-catalog-view-toggle warehouse-catalog-view-toggle--stacked"
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
    </div>
  );
}
