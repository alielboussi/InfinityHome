import React, { useCallback, useMemo } from 'react';
import { List, useDynamicRowHeight } from 'react-window';
import { buildProductsListRowMeta } from './productsListRowMeta';
import { PRODUCTS_LIST_ROW_BASE_HEIGHT } from './productsListConstants';

function VirtualProductRow({ index, style, ariaAttributes, items, rowCtx, RowComponent }) {
  const item = items[index];
  if (!item) return null;
  const meta = buildProductsListRowMeta(item, rowCtx);
  return (
    <div style={style} className="products-list-virtual-row-wrap" {...ariaAttributes}>
      <table className="products-list-table products-list-table--virtual-slice">
        <tbody>
          <RowComponent item={item} meta={meta} ctx={rowCtx} />
        </tbody>
      </table>
    </div>
  );
}

export default function ProductsListVirtualTbody({
  items,
  rowCtx,
  RowComponent,
  height = 560,
  listKey,
}) {
  const initialRowHeights = useMemo(
    () => items.map((item) => buildProductsListRowMeta(item, rowCtx).estimatedHeight),
    [items, rowCtx],
  );

  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: PRODUCTS_LIST_ROW_BASE_HEIGHT,
    initialRowHeights,
    key: listKey,
  });

  const rowComponent = useCallback(
    (props) => (
      <VirtualProductRow
        {...props}
        items={items}
        rowCtx={rowCtx}
        RowComponent={RowComponent}
      />
    ),
    [items, rowCtx, RowComponent],
  );

  if (!items.length) return null;

  return (
    <List
      className="products-list-virtual-list"
      style={{ height, width: '100%' }}
      rowCount={items.length}
      rowHeight={dynamicRowHeight}
      rowComponent={rowComponent}
      rowProps={{}}
      overscanCount={6}
    />
  );
}
