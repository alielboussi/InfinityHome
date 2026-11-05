import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMaterialUoms } from '../services/materialUomApi';
import { normalizeMaterialUom } from '../constants/carpentryUom';

export function useMaterialUomOptions() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchMaterialUoms();
      setOptions(payload?.options || []);
    } catch (err) {
      setError(err?.message || 'Failed to load UOM list');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const allowedSet = useMemo(
    () => new Set((options || []).map((o) => o.value)),
    [options],
  );

  const normalize = useCallback(
    (raw) => normalizeMaterialUom(raw, allowedSet.size ? allowedSet : undefined),
    [allowedSet],
  );

  const defaultUom = options[0]?.value || '';

  return {
    options,
    loading,
    error,
    reload,
    allowedSet,
    normalize,
    defaultUom,
  };
}
