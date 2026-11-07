import React, { useCallback } from 'react';
import { List, useDynamicRowHeight } from 'react-window';

const DEFAULT_ROW_HEIGHT = 52;

/**
 * Renders windowed rows (D4 helper). Parent supplies column cells per item.
 */
export default function VirtualizedProductRows({
  items = [],
  renderRow,
  height = 520,
  width = '100%',
  estimateRowHeight,
  listKey = 'default',
}) {
  const rowHeights = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    initialRowHeights: (items || []).map((item, index) => (
      typeof estimateRowHeight === 'function'
        ? estimateRowHeight(item, index)
        : DEFAULT_ROW_HEIGHT
    )),
    key: listKey,
  });

  const rowComponent = useCallback(
    ({ index, style, ariaAttributes }) => {
      const item = items[index];
      if (!item || typeof renderRow !== 'function') return null;
      return (
        <div style={style} className="virtual-table-row" {...ariaAttributes}>
          {renderRow(item, index)}
        </div>
      );
    },
    [items, renderRow],
  );

  if (!items.length) return null;

  return (
    <List
      className="virtual-products-list data-table-sticky"
      style={{ height: Math.min(height, Math.max(DEFAULT_ROW_HEIGHT, items.length * DEFAULT_ROW_HEIGHT)), width }}
      rowCount={items.length}
      rowHeight={rowHeights}
      rowComponent={rowComponent}
      rowProps={{}}
      overscanCount={8}
    />
  );
}
