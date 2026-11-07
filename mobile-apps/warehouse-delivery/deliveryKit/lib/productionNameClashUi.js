/**
 * User-facing copy when production name check finds a clash (warehouse, packet, or shop catalog).
 * Standalone copy for mobile apps (no ../../../../src imports).
 */

export function formatProductionNameClashMessage(check, duplicateLabel = 'This product name already exists.') {
  const existing = String(check?.existing || '').trim();
  const kind = String(check?.existing_kind || '').toLowerCase();
  const reason = String(check?.reason || '').toLowerCase();
  if (!existing) return duplicateLabel;

  if (kind === 'catalog') {
    const hint = ' Search Products List (shop/POS), not Warehouse → Products.';
    if (reason === 'exact_name') {
      return `${duplicateLabel} Shop catalog already has "${existing}".${hint} Rename or remove that shop product, or use a different name.`;
    }
    return `${duplicateLabel} Shop catalog already uses "${existing}" for that name line.${hint} Pick a different first name, or rename the shop product.`;
  }

  if (kind === 'packet') {
    return `${duplicateLabel} Warehouse packet "${existing}" already uses this name.`;
  }

  if (kind === 'assembly') {
    if (reason === 'exact_name') {
      return `${duplicateLabel} Warehouse → Products already has "${existing}". Edit that product in the portal — do not create it again.`;
    }
    return `${duplicateLabel} Warehouse product "${existing}" uses the same name line — search Warehouse → Products for "${existing}".`;
  }

  return `${duplicateLabel} (${existing})`;
}
