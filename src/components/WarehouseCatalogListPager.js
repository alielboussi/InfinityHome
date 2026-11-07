import React from 'react';

export const WAREHOUSE_CATALOG_PAGE_SIZE = 25;

export default function WarehouseCatalogListPager({
  page,
  pageCount,
  total,
  pageSize = WAREHOUSE_CATALOG_PAGE_SIZE,
  onPageChange,
  itemLabel = 'items',
}) {
  if (total <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), pageCount);

  return (
    <nav className="warehouse-catalog-pager" aria-label="Catalog list pages">
      <button
        type="button"
        className="warehouse-catalog-pager__btn"
        disabled={safePage <= 1}
        onClick={() => onPageChange(safePage - 1)}
      >
        Previous
      </button>
      <span className="warehouse-catalog-pager__meta">
        Page {safePage} of {pageCount}
        {' · '}
        {total} {itemLabel}
      </span>
      <button
        type="button"
        className="warehouse-catalog-pager__btn"
        disabled={safePage >= pageCount}
        onClick={() => onPageChange(safePage + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export function paginateList(rows, page, pageSize = WAREHOUSE_CATALOG_PAGE_SIZE) {
  const total = rows?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    total,
    items: (rows || []).slice(start, start + pageSize),
  };
}
