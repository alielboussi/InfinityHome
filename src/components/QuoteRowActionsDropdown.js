import React from 'react';
import { FaChevronDown } from 'react-icons/fa';

/**
 * Compact Actions menu for quotes board rows (admin + Hassan factory orders).
 */
export default function QuoteRowActionsDropdown({ items }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  const visible = (items || []).filter((item) => item && !item.hidden);
  React.useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className="portal-actions-dropdown quotes-actions-dropdown" ref={rootRef}>
      <button
        type="button"
        className="portal-actions-dropdown__trigger stock-periods-btn stock-periods-btn-secondary"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        Actions
        <FaChevronDown className="portal-actions-dropdown__chevron" aria-hidden />
      </button>
      {open ? (
        <div className="portal-actions-dropdown__menu" role="menu">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="portal-actions-dropdown__item stock-periods-btn stock-periods-btn-secondary"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
