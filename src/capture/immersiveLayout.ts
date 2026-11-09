// ---------------------------------------------------------------------------
// The full-screen document camera's layout, as numbers.
//
// The overlay (components/viewfinder) draws from these, and immersiveBand
// (documentTurn.ts) reserves the space they take, so the guide the overlay
// draws, the guide the corner gate judges and the guide the crop cuts are the
// same rectangle. Change a control's size here, never only in the component.
//
// An 8pt rhythm throughout:
//
//   topInset + 8   top bar: back, document pill, side badge (44 high)
//          + 12    the instruction, up to 2 lines
//          + 16    the guide
//          ...
//          + 24    the bottom row: upload, shutter, torch, with captions
//   bottomInset + 16
// ---------------------------------------------------------------------------

/** From the top safe inset to the top bar. */
export const TOP_BAR_OFFSET = 8;
/** Height of the top bar's controls, and the smallest touch target. */
export const TOP_BAR_HEIGHT = 44;
/** Left and right margin of the top bar. */
export const SIDE_MARGIN = 16;
/** Between the top bar's items. */
export const TOP_BAR_GAP = 8;

/** From the top bar to the instruction. */
export const HINT_GAP = 12;
/** The instruction's text: 15 on a 20 line, at most 2 lines. */
export const HINT_LINE_HEIGHT = 20;
export const HINT_MAX_LINES = 2;
export const HINT_PADDING_V = 10;
/** The instruction at its tallest. */
export const HINT_MAX_HEIGHT = HINT_MAX_LINES * HINT_LINE_HEIGHT + 2 * HINT_PADDING_V;

/** Clear space between the instruction and the guide. */
export const GUIDE_GAP_BELOW_HINT = 16;
/** Clear space between the top bar and a turned guide (its hint is beside it). */
export const GUIDE_GAP_BELOW_TOP_BAR = 16;
/** Clear space between the guide and the bottom row. */
export const GUIDE_GAP_ABOVE_CONTROLS = 24;

/** From the bottom safe inset to the bottom row. */
export const BOTTOM_OFFSET = 16;
export const SHUTTER_SIZE = 80;
/** Upload and torch: round, either side of the shutter. */
export const SIDE_BUTTON_SIZE = 52;
export const CAPTION_GAP = 6;
export const CAPTION_LINE_HEIGHT = 16;
/**
 * The bottom row's height: side buttons are centred on the shutter and their
 * captions hang below, so the row runs from the shutter's top to whichever
 * reaches lower, the shutter or a caption.
 */
export const BOTTOM_ROW_HEIGHT =
  SHUTTER_SIZE / 2 + Math.max(SHUTTER_SIZE / 2, SIDE_BUTTON_SIZE / 2 + CAPTION_GAP + CAPTION_LINE_HEIGHT);

/** The top bar's top edge. */
export function topBarTop(topInset: number): number {
  return topInset + TOP_BAR_OFFSET;
}

/** The instruction's top edge, under the top bar. */
export function hintTop(topInset: number): number {
  return topBarTop(topInset) + TOP_BAR_HEIGHT + HINT_GAP;
}

/** The lowest the instruction reaches, at 2 lines. */
export function hintBottom(topInset: number): number {
  return hintTop(topInset) + HINT_MAX_HEIGHT;
}

/** The bottom row's top edge, measured up from the bottom of the view. */
export function bottomRowReserve(bottomInset: number): number {
  return bottomInset + BOTTOM_OFFSET + BOTTOM_ROW_HEIGHT;
}
