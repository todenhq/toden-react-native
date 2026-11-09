// How tall a floating sheet may be. Pure, so it is testable without a device.

/** The least room a sheet keeps between its top and the status bar. */
export const SHEET_TOP_GAP = 16;

/**
 * The tallest a sheet may be: the screen less the status bar, the gap under it,
 * the float off the bottom and any keyboard lift. A caller's own cap still
 * applies when it is lower; the body scrolls inside.
 */
export function sheetMaxHeight(
  screenHeight: number,
  statusBar: number,
  floatGap: number,
  bottomOffset: number,
  requested?: number,
): number {
  const room = screenHeight - statusBar - SHEET_TOP_GAP - floatGap - bottomOffset;
  return requested === undefined ? room : Math.min(requested, room);
}
