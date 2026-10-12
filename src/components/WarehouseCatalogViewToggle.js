import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function WarehouseCatalogViewToggle({ 'aria-labelledby': ariaLabelledBy } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isPackets = location.pathname.startsWith('/warehouse-products/packets');

  return (
    <div
      className="warehouse-catalog-view-toggle"
      role="group"
      aria-label={ariaLabelledBy ? undefined : 'Warehouse catalog view'}
      aria-labelledby={ariaLabelledBy || undefined}
    >
      <button
        type="button"
        className={`warehouse-catalog-view-toggle__option${!isPackets ? ' is-active' : ''}`}
        aria-pressed={!isPackets}
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
    </div>
  );
}
