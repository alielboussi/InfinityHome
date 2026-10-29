import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kioskFooterBottomPad } from './kioskLayout';

export const PRODUCTION_DASHBOARD_COLUMNS = 2;

/**
 * Two-column dashboard card grid — equal-sized tiles per row (scrolls on short screens).
 */
export function useProductionDashboardTileLayout(tileCount) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const count = Math.max(1, Math.min(12, Number(tileCount) || 1));
    const columns = PRODUCTION_DASHBOARD_COLUMNS;
    const gap = 12;
    const horizontalPad = 20;
    const topReserved = (insets?.top ?? 0) + 108;
    const bottomReserved = kioskFooterBottomPad(insets) + 12;
    const availW = Math.max(200, width - horizontalPad * 2);
    const availH = Math.max(160, height - topReserved - bottomReserved);
    const rows = Math.ceil(count / columns);
    const tileWidth = Math.floor((availW - gap * (columns - 1)) / columns);
    const rawHeight = Math.floor((availH - gap * Math.max(0, rows - 1)) / rows);
    const tileHeight = Math.max(104, Math.min(168, rawHeight));

    return {
      layout: 'grid',
      columns,
      gap,
      horizontalPad,
      tileWidth,
      tileHeight,
      contentWidth: columns * tileWidth + gap * (columns - 1),
    };
  }, [width, height, insets, tileCount]);
}
