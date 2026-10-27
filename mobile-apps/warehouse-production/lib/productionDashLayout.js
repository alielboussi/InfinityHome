import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kioskFooterBottomPad } from './kioskLayout';

/**
 * Single-column dashboard tiles — equal height rows filling the screen (no scroll).
 */
export function useProductionDashboardTileLayout(tileCount) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const count = Math.max(1, Math.min(3, Number(tileCount) || 1));
    const gap = 12;
    const horizontalPad = 32;
    const topReserved = (insets?.top ?? 0) + 108;
    const bottomReserved = kioskFooterBottomPad(insets) + 12;
    const availW = Math.max(200, width - horizontalPad);
    const availH = Math.max(160, height - topReserved - bottomReserved);
    const tileWidth = Math.floor(availW);
    const tileHeight = Math.floor((availH - gap * (count - 1)) / count);

    return {
      layout: 'column',
      gap,
      tileWidth,
      tileHeight: Math.max(72, tileHeight),
    };
  }, [width, height, insets, tileCount]);
}
