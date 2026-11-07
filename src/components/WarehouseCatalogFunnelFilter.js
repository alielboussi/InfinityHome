import React, { useMemo } from 'react';
import { FaFilter } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';

const FUNNEL_OPTIONS = [
  { value: '', label: 'All (no extra filter)' },
  { value: 'unassigned-packets', label: 'Unassigned packets' },
  { value: 'incomplete-products', label: 'Incomplete products' },
];

function resolveFunnelValue(pathname, search) {
  const path = pathname || '';
  const params = new URLSearchParams(search || '');
  if (path.startsWith('/warehouse-products/packets')) {
    return params.get('assignment') === 'unassigned' ? 'unassigned-packets' : '';
  }
  const view = String(params.get('view') || '').toLowerCase();
  if (view === 'incomplete') return 'incomplete-products';
  return '';
}

export default function WarehouseCatalogFunnelFilter({ className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const onFloorsHub = location.pathname.startsWith('/warehouse-floors');

  const current = useMemo(
    () => resolveFunnelValue(location.pathname, location.search),
    [location.pathname, location.search],
  );

  const apply = (value) => {
    if (value === 'unassigned-packets') {
      navigate('/warehouse-products/packets?assignment=unassigned');
      return;
    }
    if (value === 'incomplete-products') {
      if (onFloorsHub) {
        navigate('/warehouse-floors?floor=1&view=incomplete');
        return;
      }
      navigate('/warehouse-products?view=incomplete');
      return;
    }
    if (location.pathname.startsWith('/warehouse-products/packets')) {
      navigate('/warehouse-products/packets');
      return;
    }
    if (onFloorsHub) {
      navigate('/warehouse-floors?floor=1');
      return;
    }
    navigate('/warehouse-products');
  };

  return (
    <label className={`warehouse-catalog-funnel ${className}`.trim()}>
      <span className="warehouse-catalog-funnel__icon" aria-hidden>
        <FaFilter />
      </span>
      <select
        className="warehouse-catalog-funnel__select pos-control"
        value={current}
        aria-label="Extra catalog filter"
        onChange={(e) => apply(e.target.value)}
      >
        {FUNNEL_OPTIONS.map((opt) => (
          <option key={opt.value || 'none'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
