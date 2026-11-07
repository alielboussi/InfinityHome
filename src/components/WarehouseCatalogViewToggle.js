import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const VIEW_OPTIONS = [
  { value: 'sets', label: 'Sets' },
  { value: 'products', label: 'Products' },
  { value: 'packets', label: 'Packets' },
  { value: 'sales-storage', label: 'Sales storage' },
];

const PRIMARY_VIEWS = new Set(['sets', 'products', 'packets', 'sales-storage']);

function resolveCurrentView(pathname, search) {
  const path = pathname || '';
  const params = new URLSearchParams(search || '');
  if (path.startsWith('/warehouse-products/packets')) {
    return 'packets';
  }
  const view = String(params.get('view') || 'products').toLowerCase();
  if (PRIMARY_VIEWS.has(view)) return view;
  return 'products';
}

export default function WarehouseCatalogViewToggle({ 'aria-labelledby': ariaLabelledBy } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const onFloorsHub = location.pathname.startsWith('/warehouse-floors');

  const currentValue = useMemo(
    () => resolveCurrentView(location.pathname, location.search),
    [location.pathname, location.search],
  );

  const goView = (value) => {
    if (value === 'packets') {
      navigate('/warehouse-products/packets');
      return;
    }
    if (onFloorsHub) {
      const qs = value === 'products' ? 'floor=1' : `floor=1&view=${encodeURIComponent(value)}`;
      navigate(`/warehouse-floors?${qs}`);
      return;
    }
    navigate(value === 'products' ? '/warehouse-products' : `/warehouse-products?view=${value}`);
  };

  return (
    <select
      className="warehouse-catalog-view-select warehouse-catalog-filter-control pos-control"
      value={currentValue}
      aria-label={ariaLabelledBy ? undefined : 'Warehouse catalog view'}
      aria-labelledby={ariaLabelledBy || undefined}
      onChange={(e) => goView(e.target.value)}
    >
      {VIEW_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
