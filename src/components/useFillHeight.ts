import { useCallback, useState } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// The map and Street View run down to the Continue button on a tall phone
// instead of leaving an empty band above it, and keep their usual height (the
// body scrolls) on a short one. StickyActions lets its scroll content grow to
// the body's height; the surface's box grows into what is left (`flexGrow`,
// never below `minimum`), measures itself, and hands that height to the map,
// whose tiles and frame maths need a number. Mirrors the Flutter SDK's
// widgets/fill_remaining.dart.
// ---------------------------------------------------------------------------

/** The height a surface draws at: what its box measured, never below the minimum. */
export function fillHeightOf(measured: number | null, minimum: number): number {
  return measured != null && Number.isFinite(measured) ? Math.max(minimum, Math.round(measured)) : minimum;
}

export function useFillHeight(minimum: number): {
  height: number;
  style: ViewStyle;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setMeasured((prev) => (prev === next ? prev : next));
  }, []);
  return { height: fillHeightOf(measured, minimum), style: { flexGrow: 1, minHeight: minimum }, onLayout };
}
