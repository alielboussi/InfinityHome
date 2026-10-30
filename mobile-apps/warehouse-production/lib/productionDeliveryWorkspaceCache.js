/** In-memory delivery draft — survives stack remount (lock/unlock) within the same app process. */

let workspace = null;

export function readDeliveryWorkspace() {
  if (!workspace) return null;
  return {
    sessionId: workspace.sessionId || '',
    deliveryNumber: workspace.deliveryNumber || '',
    groups: Array.isArray(workspace.groups) ? workspace.groups : [],
  };
}

export function writeDeliveryWorkspace(next) {
  if (!next?.sessionId) {
    workspace = null;
    return;
  }
  workspace = {
    sessionId: String(next.sessionId),
    deliveryNumber: String(next.deliveryNumber || ''),
    groups: Array.isArray(next.groups) ? next.groups : [],
  };
}

export function clearDeliveryWorkspace() {
  workspace = null;
}
