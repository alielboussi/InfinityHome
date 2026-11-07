import React from 'react';
import { FaPlus } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

export default function WarehouseCatalogCreateActions({
  canManage = false,
  canAddProduct = false,
  hidden = false,
}) {
  const navigate = useNavigate();
  if (hidden || (!canManage && !canAddProduct)) return null;

  return (
    <div className="warehouse-catalog-header-actions" role="group" aria-label="Create catalog items">
      {canAddProduct ? (
        <button
          type="button"
          className="warehouse-catalog-action-btn"
          onClick={() => navigate('/warehouse-products/new?kind=set')}
        >
          <FaPlus aria-hidden />
          <span>Set</span>
        </button>
      ) : null}
      {canAddProduct ? (
        <button
          type="button"
          className="warehouse-catalog-action-btn warehouse-catalog-action-btn--primary"
          onClick={() => navigate('/warehouse-products/new')}
        >
          <FaPlus aria-hidden />
          <span>Product</span>
        </button>
      ) : null}
      {canManage ? (
        <button
          type="button"
          className="warehouse-catalog-action-btn"
          onClick={() => navigate('/warehouse-products/packets/new')}
        >
          <FaPlus aria-hidden />
          <span>Packet</span>
        </button>
      ) : null}
    </div>
  );
}
