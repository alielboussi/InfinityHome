import React, { useMemo, useState } from 'react';

const EN_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const AR_ROWS = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
];

export default function ProductionVirtualKeyboard({
  open,
  onClose,
  onKey,
  onBackspace,
  onSpace,
  onEnter,
  initialLayout = 'ar',
}) {
  const [layout, setLayout] = useState(initialLayout === 'en' ? 'en' : 'ar');
  const rows = useMemo(() => (layout === 'ar' ? AR_ROWS : EN_ROWS), [layout]);

  if (!open) return null;

  return (
    <div className="production-vk" role="dialog" aria-label="Keyboard">
      <div className="production-vk__toolbar">
        <button type="button" className="production-vk__btn" onClick={() => setLayout((l) => (l === 'ar' ? 'en' : 'ar'))}>
          {layout === 'ar' ? 'English' : 'العربية'}
        </button>
        <button type="button" className="production-vk__btn production-vk__btn--ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="production-vk__keys">
        {rows.map((row, ri) => (
          <div key={`r-${ri}`} className="production-vk__row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className="production-vk__key"
                onClick={() => onKey(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
        <div className="production-vk__row production-vk__row--actions">
          <button type="button" className="production-vk__key production-vk__key--wide" onClick={onSpace}>
            Space
          </button>
          <button type="button" className="production-vk__key" onClick={onBackspace}>
            ⌫
          </button>
          <button type="button" className="production-vk__key production-vk__key--wide" onClick={onEnter}>
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
