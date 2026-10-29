/** Return reasons for Kitwe → Factory product returns (Hassan quotationer). */

export const WAREHOUSE_RETURN_REASON_GROUPS = Object.freeze([
  {
    id: 'upholstery',
    label: 'Upholstery',
    reasons: Object.freeze([
      'Upholstery',
      'Maintenance',
      'Cushion',
      'Design',
      'Repair',
      'Color',
      'Size',
    ]),
  },
  {
    id: 'carpentry',
    label: 'Carpentry',
    reasons: Object.freeze([
      'Structure',
      'Legs',
      'Finish',
      'Design',
      'Repair',
      'Color',
      'Size',
    ]),
  },
  {
    id: 'general',
    label: 'General',
    reasons: Object.freeze(['Maintenance', 'Quality check', 'Other']),
  },
]);

export const WAREHOUSE_RETURN_REASONS_FLAT = Object.freeze(
  WAREHOUSE_RETURN_REASON_GROUPS.flatMap((g) => g.reasons),
);

export function normalizeWarehouseReturnReason(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const hit = WAREHOUSE_RETURN_REASONS_FLAT.find(
    (r) => r.toLowerCase() === v.toLowerCase(),
  );
  return hit || v;
}
