import { ease, passLook, swell, TICK_POP_S, type PassLook } from '../lib/previewMotion';
import { NARRATOR_SECONDS, type NarratorGesture } from './narratorPose';

// ---------------------------------------------------------------------------
// The loop of the liveness intro's picture (screens/liveness/GesturePreview):
// a cartoon person in a copy of the camera's window, running through the
// gestures the camera may ask for while the window's line fills one part per
// gesture, each ending as the camera's challenge_passed does, with a light
// green cover and a tick. Pure: a function of the round's own clock.
//
// The numbers are the web SDK's steps/liveness/GesturePreview.tsx. One
// difference, so a round can be one native animation: the round ends once
// the last tick has finished dropping away (TICK_POP_S later than the web
// starts the next one), rather than with the tick still on its way out.
// ---------------------------------------------------------------------------

/** The classic gestures the intro's picture runs through. (The web's picture
 *  also has a head directions round; this SDK's intro does not yet.) */
export type PreviewGesture = Extract<NarratorGesture, 'turn' | 'nod' | 'blink' | 'smile'>;

export const PREVIEW_GESTURES: readonly PreviewGesture[] = ['turn', 'nod', 'blink', 'smile'];

/** Coming in, once: how long, and how much too close it gets on the way. */
export const COMING_IN_S = 1.1;
const OVERSHOOT = 0.06;
/** The tick after each gesture: on screen this long, then the next one. */
const PASS_HOLD = 0.8;
/** The tick after the last gesture, before it all goes round again. */
const TICK_HOLD = 1.1;
/** The line eases after its progress, by about this much: the tick waits
 *  for the line to be seen to close, and no longer. */
const LINE_CATCH_UP = 0.15;
/** A passive check: how long the line takes to close round a still face. */
const HOLD_S = 2.4;
/** How far the face slides across the head at the end of a turn or a nod, in
 *  the drawing's own units (it is 768 across). */
export const TURN_SLIDE = 46;
export const NOD_SLIDE = 30;

export interface PreviewPose {
  /** Across, -1 (their right, our left) to 1. */
  across: number;
  /** Down, -1 (up) to 1. */
  down: number;
  shut: boolean;
  smile: boolean;
}

export const PREVIEW_REST: PreviewPose = { across: 0, down: 0, shut: false, smile: false };

/** The pose `at` seconds into one gesture. Seconds each one takes are the narrator's. */
export function previewPose(gesture: PreviewGesture, at: number): PreviewPose {
  const t = at / NARRATOR_SECONDS[gesture];
  switch (gesture) {
    case 'turn':
      // One way, across to the other, and back to the middle.
      return { ...PREVIEW_REST, across: -ease(t / 0.3) + 2 * ease((t - 0.35) / 0.3) - ease((t - 0.72) / 0.22) };
    case 'nod':
      return { ...PREVIEW_REST, down: swell(t / 0.45) - 0.7 * swell((t - 0.45) / 0.45) };
    case 'blink':
      // Twice, quickly.
      return { ...PREVIEW_REST, shut: (t > 0.25 && t < 0.35) || (t > 0.55 && t < 0.65) };
    case 'smile':
      return { ...PREVIEW_REST, smile: t > 0.15 && t < 0.85 };
  }
}

/** One round, laid out: when each gesture runs and when each tick is up. */
export interface PreviewRound {
  /** Seconds the round takes. */
  seconds: number;
  /** Each gesture with its start; none for a passive check. */
  gestures: { gesture: PreviewGesture; start: number }[];
  /** When the line closes round a still face (a passive check), else null. */
  holdEnds: number | null;
  /** When each tick is up: [on, off). */
  ticks: [number, number][];
}

export function previewRound(gestures: readonly PreviewGesture[]): PreviewRound {
  const ticks: [number, number][] = [];
  if (gestures.length === 0) {
    const on = HOLD_S + LINE_CATCH_UP;
    ticks.push([on, on + TICK_HOLD]);
    return { seconds: on + TICK_HOLD + TICK_POP_S, gestures: [], holdEnds: HOLD_S, ticks };
  }
  const laid: PreviewRound['gestures'] = [];
  let at = 0;
  gestures.forEach((gesture, i) => {
    laid.push({ gesture, start: at });
    const on = at + NARRATOR_SECONDS[gesture] + LINE_CATCH_UP;
    const off = on + (i === gestures.length - 1 ? TICK_HOLD : PASS_HOLD);
    ticks.push([on, off]);
    at = off;
  });
  return { seconds: at + TICK_POP_S, gestures: laid, holdEnds: null, ticks };
}

/** The pose at `at` seconds into the round: at rest between gestures. */
export function roundPose(round: PreviewRound, at: number): PreviewPose {
  for (const { gesture, start } of round.gestures) {
    if (at >= start && at < start + NARRATOR_SECONDS[gesture]) return previewPose(gesture, at - start);
  }
  return PREVIEW_REST;
}

/** How far round the window's line is, 0 to 1: one part per gesture. */
export function roundProgress(round: PreviewRound, at: number): number {
  if (round.holdEnds != null) return Math.min(1, Math.max(0, at / round.holdEnds));
  const n = round.gestures.length;
  let done = 0;
  for (const { gesture, start } of round.gestures) {
    const length = NARRATOR_SECONDS[gesture];
    if (at >= start + length) done += 1;
    else if (at > start) return (done + (at - start) / length) / n;
    else break;
  }
  return done / n;
}

/** The cover and the tick at `at` seconds into the round. */
export function roundPass(round: PreviewRound, at: number): PassLook {
  return passLook(round.ticks, at);
}

/** Coming in, `at` seconds after the picture appeared: from a little way
 *  back, past where it fits, and back. */
export function comingIn(at: number): { opacity: number; scale: number } {
  const t = Math.min(1, Math.max(0, at / COMING_IN_S));
  return {
    opacity: Math.min(1, t / 0.35),
    scale: 0.86 + (0.14 + OVERSHOOT) * ease(t / 0.6) - OVERSHOOT * ease((t - 0.6) / 0.4),
  };
}
