/** Product list: stock moves go through Transfers; historical adjustments stay in DB. */
export const TRANSFERS_PAGE_PATH = '/transfers';

export function productsListStockMoveDisabledMessage() {
  return (
    'Use Transfers in the side menu to move stock between locations. '
    + 'Add / deduct stock on this page is turned off. '
    + 'Past adjustments are unchanged in history and reports.'
  );
}
