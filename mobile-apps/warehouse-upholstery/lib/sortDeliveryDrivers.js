export function sortDeliveryDriversByName(drivers) {
  return [...(drivers || [])].sort((a, b) =>
    String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }),
  );
}
