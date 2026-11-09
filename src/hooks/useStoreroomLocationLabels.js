import { useEffect, useState } from 'react';
import db from '../dataClient';
import { buildStoreroomLabelMap } from '../utils/productionJobMaterialLines';

export function useStoreroomLocationLabels() {
  const [labelByLocationId, setLabelByLocationId] = useState(() => new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await db.from('locations').select('id, name');
        if (error || !alive) return;
        setLabelByLocationId(buildStoreroomLabelMap(data || []));
      } catch {
        /* optional */
      }
    })();
    return () => { alive = false; };
  }, []);

  return labelByLocationId;
}
