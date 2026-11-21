import type { DirectionChallenge } from '../liveness/types';
import type { WindowSide } from './windowSegments';

// ---------------------------------------------------------------------------
// What the four-sided line round the window shows when the test is head
// directions (screens/liveness/SideRing). Pure, so it is tested without a
// screen. The web SDK's steps/liveness/SideRing.tsx, rule for rule.
//
//   waiting   a quiet white line, the same over any room
//   asked     amber and thicker: the side to turn to. Never the workflow's
//             colour: it is a signal, not branding
//   done      green
//
// Waiting and asked differ in weight and brightness as well as colour. There
// are no ticks on the line: the tick in the window after each direction, the
// words and the voice say a direction is done.
// ---------------------------------------------------------------------------

/** The side of the window each direction lights. Left and right are the
 *  person's own, which on the mirrored preview are the screen's. */
export const SIDE_OF: Record<DirectionChallenge, WindowSide> = {
  turnLeft: 'left',
  turnRight: 'right',
  lookUp: 'top',
  lookDown: 'bottom',
};

export type SideState = 'idle' | 'asked' | 'done';

/** What each side shows, from the direction asked for and those done. */
export function sideStates(
  asked: DirectionChallenge | null,
  done: readonly DirectionChallenge[],
): Record<WindowSide, SideState> {
  const out: Record<WindowSide, SideState> = { top: 'idle', right: 'idle', bottom: 'idle', left: 'idle' };
  if (asked) out[SIDE_OF[asked]] = 'asked';
  // Done wins: a side that is green stays green.
  for (const direction of done) out[SIDE_OF[direction]] = 'done';
  return out;
}

/** Whether the line closes into one green ring: every direction the run asks
 *  is done, which may be two, three or four sides. */
export function ringClosed(directions: readonly DirectionChallenge[], done: readonly DirectionChallenge[]): boolean {
  return directions.length > 0 && directions.every((direction) => done.includes(direction));
}

/** The side to turn to (the web's `--verification-attention` default). */
export const ATTENTION = '#ffb020';
/** A waiting side: white, quiet, readable over any room under the shadow. */
export const WAITING = 'rgba(255, 255, 255, 0.7)';
/** The asked side is the heaviest line on screen: 10 against the line's 6. */
export const LIT_STROKE_EXTRA = 4;
/** The pulse when the ring closes: how far it grows as it fades, and how long. */
export const PULSE_GROW = 1.07;
export const PULSE_MS = 850;
/** How long a side takes to change colour and weight. */
export const SIDE_EASE_MS = 300;

/**
 * The shadow under the line, drawn as part of it: the same path underneath,
 * wider and in faint black. A React Native view shadow is iOS only, and an
 * Android view casts one only from a solid outline, which this see-through
 * line has none of, so it drew nothing there (user, 2026-11-18: "fix it").
 * Drawn in the SVG, it is the same on both phones. Two layers, as the web's
 * two drop shadows: a soft one a point below (0 1px 3px, 25%) and a close
 * edge (0 0 1px, 50%), lighter here because a stroke is solid where a blur
 * fades. `extra` is added to the line's own width.
 */
export const SHADOW_LAYERS: ReadonlyArray<{ extra: number; colour: string; dy: number }> = [
  { extra: 6, colour: 'rgba(0, 0, 0, 0.12)', dy: 1 },
  { extra: 2, colour: 'rgba(0, 0, 0, 0.28)', dy: 0 },
];
