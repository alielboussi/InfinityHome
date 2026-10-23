import React, { useEffect, useMemo, useState } from 'react';

/** QWERTY positions — labels switch between Latin and Arabic (standard Arabic keyboard mapping). */
const QWERTY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const ARABIC_BY_QWERTY = {
  q: 'ض', w: 'ص', e: 'ث', r: 'ق', t: 'ف', y: 'غ', u: 'ع', i: 'ه', o: 'خ', p: 'ج',
  '[': 'د', ']': 'ذ',
  a: 'ش', s: 'س', d: 'ي', f: 'ب', g: 'ل', h: 'ا', j: 'ت', k: 'ن', l: 'م',
  ';': 'ك', "'": 'ط',
  z: 'ئ', x: 'ء', c: 'ؤ', v: 'ر', b: 'ى', n: 'ة', m: 'و',
  ',': 'و', '.': 'ز', '/': 'ظ',
};

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

  useEffect(() => {
    setLayout(initialLayout === 'en' ? 'en' : 'ar');
  }, [initialLayout, open]);

  const rows = useMemo(() => QWERTY_ROWS, []);

  const emitKey = (qwertyKey) => {
    if (layout === 'ar') {
      const ar = ARABIC_BY_QWERTY[qwertyKey] || qwertyKey;
      onKey(ar);
      return;
    }
    onKey(qwertyKey);
  };

  if (!open) return null;

  return (
    <div className="production-vk" role="dialog" aria-label="Keyboard">
      <div className="production-vk__toolbar">
        <button
          type="button"
          className="production-vk__btn production-vk__btn--layout"
          onClick={() => setLayout((l) => (l === 'ar' ? 'en' : 'ar'))}
        >
          {layout === 'ar' ? 'English (QWERTY)' : 'العربية (QWERTY)'}
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
                onClick={() => emitKey(key)}
              >
                <span className="production-vk__key-main">
                  {layout === 'ar' ? (ARABIC_BY_QWERTY[key] || key) : key}
                </span>
                <span className="production-vk__key-sub" aria-hidden="true">
                  {layout === 'ar' ? key : (ARABIC_BY_QWERTY[key] || '')}
                </span>
              </button>
            ))}
          </div>
        ))}
        <div className="production-vk__row production-vk__row--actions">
          <button type="button" className="production-vk__key production-vk__key--wide" onClick={onSpace}>
            Space
          </button>
          <button type="button" className="production-vk__key production-vk__key--action" onClick={onBackspace}>
            ⌫
          </button>
          <button type="button" className="production-vk__key production-vk__key--wide production-vk__key--action" onClick={onEnter}>
            Search ↵
          </button>
        </div>
      </div>
    </div>
  );
}
