import { useEffect, useState } from "react";
import db from '../dataClient';

// Detect whether optional combos columns exist so UI can adapt gracefully.
export default function useComboColumnSupport() {
  const [support, setSupport] = useState({
    category: true,
    unit: true,
    categoryReason: '',
    unitReason: '',
    checked: false,
  });

  useEffect(() => {
    let isActive = true;

    const probeColumn = async (column) => {
      const { error } = await db.from("combos").select(column).limit(1);
      if (!error) {
        return { supported: true, reason: '' };
      }
      const rawMessage = error.message || '';
      const message = rawMessage.toLowerCase();
      if (message.includes(`column combos.${column}`) && message.includes("does not exist")) {
        return {
          supported: false,
          reason: `Column combos.${column} does not exist`,
        };
      }
      console.warn(`Unexpected error probing combos column ${column}`, error);
      return { supported: true, reason: '' };
    };

    const runProbe = async () => {
      const [categoryResult, unitResult] = await Promise.all([
        probeColumn("category_id"),
        probeColumn("unit_of_measure_id"),
      ]);
      if (!isActive) return;
      setSupport({
        category: categoryResult.supported,
        unit: unitResult.supported,
        categoryReason: categoryResult.reason,
        unitReason: unitResult.reason,
        checked: true,
      });
    };

    runProbe();
    return () => { isActive = false; };
  }, []);

  return support;
}
