// ---------------------------------------------------------------------------
// The hint beside a turned guide.
//
// A NIN slip on a phone held upright is framed upright and drawn a quarter
// turn clockwise (documentTurn.ts), so the person turns the phone a quarter
// anticlockwise to frame it. The hint pill turns with the sample so it reads
// upright in that hold, and sits along the guide's LEFT edge, which is then the
// guide's bottom edge. Only the drawing turns: the words, and what a screen
// reader says, are the same. Mirrored by the Flutter SDK (document_viewfinder
// kTurnedHintQuarterTurns).
// ---------------------------------------------------------------------------

import type { GuideRect } from './documentTurn';

/** Clockwise turn of the hint beside a turned guide, as the sample is drawn. */
export const TURNED_HINT_ROTATION = '90deg';

export interface TurnedHintBox {
  left: number;
  top: number;
  /** Before the turn: the length the hint may run, the guide's height. */
  width: number;
  /** Before the turn: the room beside the guide. */
  height: number;
}

/**
 * The box to draw the hint in, before it is turned about its centre: as long
 * as the guide is tall and as deep as the space left of the guide, so that
 * once turned it fills exactly that space, centred on the guide's middle.
 */
export function turnedHintBox(guide: GuideRect): TurnedHintBox {
  const length = guide.height;
  const depth = Math.max(0, guide.x);
  const cx = depth / 2;
  const cy = guide.y + guide.height / 2;
  return { left: cx - length / 2, top: cy - depth / 2, width: length, height: depth };
}
