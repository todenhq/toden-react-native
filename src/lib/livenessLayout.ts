import { spacing } from '../config/theme';

// ─── How big the selfie circle may be ────────────────────────────────────────
//
// The circle used to be sized from the window's WIDTH alone (capped at 300),
// which is the web SDK's rule and is right on a tall phone. On a Samsung S24
// (360×780 dp, 176 dp shorter than an iPhone 16 Pro Max) the width still gave
// 296 and the circle owned most of the sheet. So the HEIGHT bounds it too:
// whatever the chrome, the instruction, the step dots and the footer leave
// over is what the circle may take. (A gesture picture once stood under it
// too; it is gone, and the budget is kept as measured.)
//
// Mirrored in Flutter's liveness/liveness_layout.dart; the real phones below
// are the shared vectors. Change a number in one and change both.

/** The web's phone circle is 256 and its desktop one 320; 300 is where this
 *  SDK has always capped, and the tall phones keep it. */
export const CIRCLE_MAX = 300;
/** A face is still usable at 200; below that the ring and the oval guide start
 *  to crowd it, so a very short screen scrolls a little instead. */
export const CIRCLE_MIN = 200;
/** Everything on the sheet that is NOT the circle, measured on device:
 *  banner + brand row + title + step bar (~250), the instruction line, the
 *  dots, the large avatar, three gaps, the step padding and the footer. */
export const CIRCLE_HEIGHT_BUDGET = 540;
/** The circle keeps the step's own side padding on both sides. */
export const CIRCLE_SIDE_GUTTER = spacing.md * 4;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export interface LivenessLayout {
  /** Diameter of the camera circle, dp. */
  circle: number;
}

export function livenessLayout(window: { width: number; height: number }): LivenessLayout {
  const byWidth = window.width - CIRCLE_SIDE_GUTTER;
  const byHeight = window.height - CIRCLE_HEIGHT_BUDGET;
  return { circle: clamp(Math.min(byWidth, byHeight, CIRCLE_MAX), CIRCLE_MIN, CIRCLE_MAX) };
}
