import { HASSAN_AWAD } from '../accessControl.js';
import {
  normalizeWarehouseReturnReason,
  WAREHOUSE_RETURN_REASON_GROUPS,
} from './warehouseReturnReasons.js';

export const REPAIR_DEPARTMENTS = Object.freeze([
  { id: 'upholstery', label: 'Upholstery' },
  { id: 'carpentry', label: 'Carpentry' },
  { id: 'painting', label: 'Painting' },
]);

const GROUP_BY_ID = Object.fromEntries(
  WAREHOUSE_RETURN_REASON_GROUPS.map((g) => [g.id, g]),
);

/** Production repair queue department from Hassan return reason + optgroup. */
export function resolveReturnRepairDepartment(row) {
  const reason = normalizeWarehouseReturnReason(row?.reason);
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const groupId = String(row?.reason_group || meta.reason_group || '').trim().toLowerCase();

  if (groupId === 'upholstery') return 'upholstery';
  if (groupId === 'general') return 'carpentry';
  if (groupId === 'carpentry') {
    if (reason.toLowerCase() === 'color') return 'painting';
    return 'carpentry';
  }

  const lower = reason.toLowerCase();
  if (lower === 'color') return 'painting';
  if (['structure', 'legs', 'finish', 'quality check', 'other'].includes(lower)) return 'carpentry';
  if (['upholstery', 'cushion'].includes(lower)) return 'upholstery';
  if (lower === 'maintenance') return 'carpentry';
  if (['design', 'repair', 'size'].includes(lower)) return 'upholstery';
  return 'upholstery';
}

export function returnMatchesRepairDepartment(row, department) {
  const dept = String(department || '').trim().toLowerCase();
  if (!dept) return true;
  return resolveReturnRepairDepartment(row) === dept;
}

export function isReturnCreatedByHassan(row) {
  const email = String(row?.created_by_email || '').trim().toLowerCase();
  if (HASSAN_AWAD.emails.some((e) => e.toLowerCase() === email)) return true;
  const creatorId = String(row?.created_by_id || '').trim().toLowerCase();
  if (creatorId && creatorId === String(HASSAN_AWAD.id).toLowerCase()) return true;
  const name = String(row?.created_by_name || '').trim().toLowerCase();
  if (name === String(HASSAN_AWAD.displayName).toLowerCase()) return true;
  return false;
}

export function repairDepartmentLabel(departmentId) {
  const hit = REPAIR_DEPARTMENTS.find((d) => d.id === departmentId);
  return hit?.label || departmentId || '—';
}

export function reasonGroupForOption(groupId, reason) {
  const g = GROUP_BY_ID[groupId];
  if (!g) return null;
  if (!g.reasons.includes(reason)) return null;
  return groupId;
}
