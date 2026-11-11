import { WAREHOUSE_RETURN_REASON_GROUPS } from './warehouseReturnUi';

export function upholsteryRepairReasonOptions() {
  const group = WAREHOUSE_RETURN_REASON_GROUPS.find((g) => g.id === 'upholstery');
  return (group?.reasons || []).map((r) => ({ value: `upholstery::${r}`, label: r }));
}

export function carpentryRepairReasonOptions() {
  const group = WAREHOUSE_RETURN_REASON_GROUPS.find((g) => g.id === 'carpentry');
  return (group?.reasons || []).map((r) => ({ value: `carpentry::${r}`, label: r }));
}

export function applyRepairReasonPick(value) {
  const [group, ...rest] = String(value || '').split('::');
  return {
    reason_group: group || '',
    reason: rest.join('::'),
  };
}
