import React, { useEffect, useRef, useState } from 'react';
import { FaFilter } from 'react-icons/fa';

const OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'customer', label: 'Customer' },
  { value: 'showroom', label: 'Showroom' },
];

export default function OrdersTypeFunnelFilter({ value = 'all', onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const active = value !== 'all';

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="quotes-orders-type-funnel">
      <button
        type="button"
        className={`quotes-orders-type-funnel__btn${active ? ' quotes-orders-type-funnel__btn--active' : ''}`}
        aria-label="Filter by order type"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FaFilter aria-hidden />
      </button>
      {open ? (
        <div className="quotes-orders-type-funnel__panel" role="dialog" aria-label="Order type filter">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`quotes-orders-type-funnel__option${value === opt.value ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}