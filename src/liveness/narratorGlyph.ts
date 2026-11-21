import type { NarratorPose } from './narratorPose';

// ---------------------------------------------------------------------------
// The gesture narrator's drawing, in a 100 by 100 square: the paths for a
// pose. Drawn as Apple draws its face recognition face: a round head filling
// the square, with no ring round it, and the features kept to the head, so in
// a turn or a nod they slide round it as on a ball, and the head turns with
// them: its outline narrows and leans the way it goes.
//
// The web SDK draws the same shapes (steps/liveness/GestureNarrator.tsx) and
// moves the features with group transforms; react-native-svg cannot write a
// group's transform without re-rendering, so here every transform is worked
// into each path's points, and the screen writes only `d` and the lids'
// opacity per frame (setNativeProps, as WindowRing does). The web also clips
// the features to the inside of the head's line; no pose takes them near it
// (pinned by __tests__/gestureNarrator.test.ts), so no clip is drawn here.
// ---------------------------------------------------------------------------

/** The line's weight, in the square's units: heavy enough to hold over a busy
 *  camera picture. */
export const NARRATOR_STROKE = 6.5;

const HEAD_R = 44;
/** Inside the head's line: where the features may show. */
export const FACE_INSET = 3.5;
/** How much the head's outline narrows at the end of a turn, and flattens at
 *  the end of a nod, and how far it leans that way. */
const HEAD_TURN_NARROW = 0.1;
const HEAD_NOD_FLATTEN = 0.06;
const HEAD_TURN_LEAN = 3;
const HEAD_NOD_LEAN = 2.5;
/** The features were drawn for a smaller face, so they are scaled to this
 *  head and centred on it: the web's `translate(50 50) scale(1.15) translate(-50 -54)`. */
const FEATURES_SCALE = 1.15;
const EYES_AT = [37, 63] as const;
const EYE_Y = 40;
/** Which side of the face each eye is on: the left one, then the right. */
const EYE_SIDE = [-1, 1] as const;
/** How far the eyes travel in their look, in the drawing's units. */
const LOOK_X = 3.2;
const LOOK_Y = 2.6;

export interface NarratorPaths {
  head: string;
  eyes: [string, string];
  lids: [string, string];
  /** How much the shut-eye strokes show: only as the eyes close. */
  lidOpacity: number;
  nose: string;
  mouth: string;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** The head's outline in a pose, inset by [inset]. */
export function headShape(pose: NarratorPose, inset = 0): { cx: number; cy: number; rx: number; ry: number } {
  return {
    cx: 50 + pose.across * HEAD_TURN_LEAN,
    cy: 50 + pose.down * HEAD_NOD_LEAN,
    rx: HEAD_R * (1 - HEAD_TURN_NARROW * Math.abs(pose.across)) - inset,
    ry: HEAD_R * (1 - HEAD_NOD_FLATTEN * Math.abs(pose.down)) - inset,
  };
}

/**
 * Where a point of the features lands for a pose, as [x, y]: first the
 * element's own shift (`dx`, `dy`), then the web's features transform
 * `translate(50 + across * 11, down * 8) scale(squeeze, 1) translate(-50, 0)`,
 * then the fit to the head.
 */
export function featurePoint(pose: NarratorPose, x: number, y: number, dx = 0, dy = 0): [number, number] {
  const squeeze = 1 - 0.2 * Math.abs(pose.across);
  const fx = 50 + pose.across * 11 + squeeze * (x + dx - 50);
  const fy = y + dy + pose.down * 8;
  return [round(50 + FEATURES_SCALE * (fx - 50)), round(50 + FEATURES_SCALE * (fy - 54))];
}

const lidOpacity = (open: number): number => Math.max(0, Math.min(1, (0.45 - open) / 0.35));

export function narratorPaths(pose: NarratorPose): NarratorPaths {
  const at = (x: number, y: number, dx = 0, dy = 0): string => featurePoint(pose, x, y, dx, dy).join(' ');
  const head = headShape(pose);
  const eyeAt = (i: 0 | 1) => {
    // Each eye looks ahead of the head. The one on the far side of a turn is
    // foreshortened and the near one grows; both shorten as the face tips away.
    const x = EYES_AT[i] + pose.lookX * LOOK_X;
    const y = EYE_Y + pose.lookY * LOOK_Y;
    const depth = (1 - 0.24 * pose.across * EYE_SIDE[i]) * (1 - 0.2 * Math.abs(pose.down));
    return { x, y, open: pose.eyes * depth };
  };
  // An open eye is a short upright stroke, which shrinks as it closes.
  const eye = (i: 0 | 1): string => {
    const { x, y, open } = eyeAt(i);
    const h = 4.5 * open;
    return `M${at(x, y - h)}L${at(x, y + h)}`;
  };
  // A shut eye is a short flat stroke, which shows only as the eye closes.
  const lid = (i: 0 | 1): string => {
    const { x, y } = eyeAt(i);
    return `M${at(x - 4.5, y)}L${at(x + 4.5, y)}`;
  };
  // The nose stands out from the face, so it moves further in a turn, and
  // rises a little with a smile. A line down and a hook at its tip, which
  // points the way the face turns and lengthens as the face tips down.
  const ndx = pose.across * 5;
  const ndy = pose.down * 2 - pose.smile * 1.5;
  const tip = 54 + 3 * pose.down;
  const hook = -4.5 + 8 * Math.max(0, pose.across) - 1.5 * Math.max(0, -pose.across);
  const nose = `M${at(50, 37, ndx, ndy)}L${at(50, tip, ndx, ndy)}Q${at(50, tip + 4, ndx, ndy)} ${at(50 + hook, tip + 4, ndx, ndy)}`;
  // The mouth, foreshortened on the side the face turns away to; it sits
  // lower on the face, so it moves a little less than the eyes in a nod.
  const mdy = -pose.down * 1.5;
  const end = 68 - 3 * pose.smile;
  const reach = 13 + 4 * pose.smile;
  const left = reach * (1 + 0.16 * pose.across);
  const right = reach * (1 - 0.16 * pose.across);
  const mouth = `M${at(50 - left, end, 0, mdy)}Q${at(50 + (left - right) / 2, 74 + 9 * pose.smile, 0, mdy)} ${at(50 + right, end, 0, mdy)}`;
  const r = (n: number): number => round(n);
  return {
    head:
      `M${r(head.cx - head.rx)} ${r(head.cy)}` +
      `A${r(head.rx)} ${r(head.ry)} 0 1 0 ${r(head.cx + head.rx)} ${r(head.cy)}` +
      `A${r(head.rx)} ${r(head.ry)} 0 1 0 ${r(head.cx - head.rx)} ${r(head.cy)}Z`,
    eyes: [eye(0), eye(1)],
    lids: [lid(0), lid(1)],
    lidOpacity: lidOpacity(pose.eyes),
    nose,
    mouth,
  };
}
