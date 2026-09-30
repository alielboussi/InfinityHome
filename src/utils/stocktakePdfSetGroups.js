import autoTable from 'jspdf-autotable';
import {
  chainStocktakeTableCellHooks,
  stocktakePdfTableBaseOptions,
} from './stocktakePdfTableTheme';

/** Stocktake PDF table — column headers repeat on every page. */
export function renderSegmentedStocktakeTable(doc, {
  startY,
  margin,
  colSpan: _colSpan,
  head,
  body,
  foot,
  tableOptions = {},
}) {
  const {
    didDrawCell,
    didParseCell,
    margin: marginOpt,
    ...restTableOptions
  } = tableOptions;

  const hooks = chainStocktakeTableCellHooks(didParseCell, didDrawCell);

  autoTable(doc, {
    ...stocktakePdfTableBaseOptions,
    startY,
    head,
    body,
    foot,
    showFoot: foot ? 'lastPage' : 'never',
    showHead: 'everyPage',
    margin: {
      left: margin,
      right: margin,
      bottom: 48,
      ...(marginOpt || {}),
    },
    ...restTableOptions,
    styles: {
      ...stocktakePdfTableBaseOptions.styles,
      ...(restTableOptions.styles || {}),
    },
    alternateRowStyles: {
      ...stocktakePdfTableBaseOptions.alternateRowStyles,
      ...(restTableOptions.alternateRowStyles || {}),
    },
    didDrawCell: hooks.didDrawCell,
    didParseCell: hooks.didParseCell,
  });

  return doc.lastAutoTable?.finalY ?? startY;
}
