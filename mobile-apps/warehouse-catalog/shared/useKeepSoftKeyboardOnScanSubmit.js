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

/** Strip wedge Enter/newlines from pasted or scanned text; refocus when a terminator was present. */
export function wedgeAwareTextChange(setter, { stripScanTerminator, keepFocusAfterSubmit, transform } = {}) {
  return (text) => {
    const hadTerminator = /[\r\n]/.test(String(text || ''));
    let next = stripScanTerminator ? stripScanTerminator(text) : String(text || '');
    if (transform) next = transform(next);
    setter(next);
    if (hadTerminator && keepFocusAfterSubmit) keepFocusAfterSubmit();
  };
}
