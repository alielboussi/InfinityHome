import { useEffect, useState } from 'react';

/** Debounce fast-changing values (search boxes) so filters and API calls stay smooth. */
export default function useDebouncedValue(value, delayMs = 180) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
