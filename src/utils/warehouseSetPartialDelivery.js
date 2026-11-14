/** Floor 1 delivery — ship subset of set recipe components; remainder stays loose on Floor 1. */

export function setComponentIncludedInDelivery(comp) {
  return comp?.included_in_delivery !== false;
}

export function isPartialSetDeliveryGroup(group) {
  const comps = group?.components || [];
  if (!comps.length) return false;
  const included = comps.filter(setComponentIncludedInDelivery);
  return included.length > 0 && included.length < comps.length;
}

export function excludedSetComponentsForGroup(group) {
  return (group?.components || [])
    .filter((c) => !setComponentIncludedInDelivery(c))
    .map((c) => ({
      assembly_id: c.assembly_id,
      assembly_name: c.assembly_name,
      product_qty: Math.max(0, Number(c.product_qty) || 0),
      quantity_per_set: Math.max(1, Number(c.quantity_per_set) || 1),
    }))
    .filter((c) => c.product_qty > 0);
}