import { useCallback, useRef } from 'react';

/**
 * External barcode scanners act as a keyboard and usually send Enter at the end of a scan.
 * That submit/blur cycle hides the soft keyboard. Refocus the same field so staff can keep scanning.
 */
export function useKeepSoftKeyboardOnScanSubmit(inputRef) {
  const blurGuardRef = useRef(false);

  const keepFocusAfterSubmit = useCallback(() => {
    blurGuardRef.current = true;
    const refocus = () => {
      try {
        inputRef?.current?.focus?.();
      } catch {
        /* noop */
      }
    };
    refocus();
    requestAnimationFrame(refocus);
    setTimeout(refocus, 40);
    setTimeout(() => {
      refocus();
      blurGuardRef.current = false;
    }, 150);
  }, [inputRef]);

  const wrapOnBlur = useCallback((handler) => (e) => {
    if (blurGuardRef.current) return;
    handler?.(e);
  }, []);

  const stripScanTerminator = useCallback(
    (text) => String(text || '').replace(/[\r\n\u0000-\u001F]+$/g, '').replace(/[\r\n]+/g, ''),
    [],
  );

  return { keepFocusAfterSubmit, wrapOnBlur, stripScanTerminator };
}

/** Spaces mean the user is typing a name search, not a wedge barcode — do not trim/normalize live. */
function shouldSkipLiveBarcodeNormalize(value) {
  return /\s/.test(String(value || '').replace(/[\r\n\t]/g, ' '));
}

/**
 * Strip wedge Enter/newlines; optional SKU normalize (portal barcode rules).
 * `onWedgeComplete` runs synchronously with the normalized value (use for scan submit).
 */
export function wedgeAwareTextChange(setter, {
  stripScanTerminator,
  keepFocusAfterSubmit,
  transform,
  normalize,
  onWedgeComplete,
} = {}) {
  return (text) => {
    const raw = String(text || '');
    const hadTerminator = /[\r\n\t]/.test(raw) || /[\u0000-\u001F]$/.test(raw);
    let next = stripScanTerminator ? stripScanTerminator(text) : String(text || '');
    if (transform) next = transform(next);
    if (normalize && !shouldSkipLiveBarcodeNormalize(next)) {
      const normalized = normalize(next);
      if (normalized) next = normalized;
    }
    setter(next);
    if (hadTerminator) {
      if (onWedgeComplete) onWedgeComplete(next);
      if (keepFocusAfterSubmit) keepFocusAfterSubmit();
    }
  };
}
