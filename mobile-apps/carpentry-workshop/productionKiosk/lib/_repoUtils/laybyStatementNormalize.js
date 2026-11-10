export function normalizeLaybyStatement(statement) {
  const sales = Array.isArray(statement?.sales) ? statement.sales.map((sale) => ({ ...sale })) : [];
  const items = Array.isArray(statement?.items) ? statement.items.map((item) => ({ ...item })) : [];
  const payments = Array.isArray(statement?.payments) ? statement.payments.map((payment) => ({ ...payment })) : [];

  return { sales, items, payments };
}