// ---------------------------------------------------------------------------
// The gesture narrator's poses: a face icon, in the manner of a phone's face
// unlock, acting out a gesture once.
//
//   turn   the features slide to one side and draw together, as a face does
//          turning away, then to the other side, then back to the middle
//   nod    the features drop, rise past the middle, and settle
//   blink  the eyes close and open, twice
//   smile  the mouth curves up and the eyes narrow, then it relaxes
//
// The head directions set has one pose each: the head goes ONE way, holds
// there long enough to be read, and comes back. Left and right are the
// person's own: on the mirrored camera picture their left is the screen's
// left, so `turnLeft` goes toward the left of the screen.
//
// It is alive while it does so, not a stiff diagram: the eyes look where the
// head is about to go a moment before it gets there, the lids follow the eyes
// down in a nod, it blinks as it swings through the middle of a turn, the chin
// lifts a little with a smile, and it drifts slightly as a real head never
// holds quite still. All of it settles to rest at both ends of the pass.
//
// Pure and on its own clock. A port of the web SDK's liveness/narrator-pose.ts:
// the numbers are the web's, so change them in both.
// ---------------------------------------------------------------------------

import { isDirectionChallenge, type LivenessChallenge, type LivenessPhase } from './types';

export type NarratorGesture = 'turn' | 'nod' | 'blink' | 'smile' | 'turnLeft' | 'turnRight' | 'lookUp' | 'lookDown';

/** Seconds each gesture takes, rest to rest. */
export const NARRATOR_SECONDS: Record<NarratorGesture, number> = {
  turn: 2.4,
  nod: 2,
  blink: 1.5,
  smile: 1.9,
  turnLeft: 2,
  turnRight: 2,
  lookUp: 2,
  lookDown: 2,
};

export interface NarratorPose {
  /** Sideways, -1 (towards the left of the screen) to 1. */
  across: number;
  /** Down, -1 (up) to 1. */
  down: number;
  /** How open the eyes are, 0 (shut) to 1. */
  eyes: number;
  /** How far the mouth curves up, 0 (resting) to 1 (a full smile). */
  smile: number;
  /** Where the eyes look within the face, -1 to 1 each way, as `across` and
   *  `down`. They lead the head. */
  lookX: number;
  lookY: number;
}

export const NARRATOR_REST: NarratorPose = { across: 0, down: 0, eyes: 1, smile: 0, lookX: 0, lookY: 0 };

/** How far ahead of the head the eyes are, in seconds. */
const LOOK_LEAD = 0.12;
/** How far the eyes look past where the head points, at most. */
const LOOK_REACH = 1.25;

/** Smooth from 0 to 1 over [0, 1]. */
const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2);
/** Smooth from 0 to 1 and back to 0 over [0, 1]. */
const swell = (t: number): number => (t <= 0 || t >= 1 ? 0 : (1 - Math.cos(2 * Math.PI * t)) / 2);

const clamp1 = (n: number): number => Math.max(-1, Math.min(1, n));

/** One way and back: out, held there for a moment, and home. 0 at both ends. */
const outAndBack = (t: number): number => ease(t / 0.3) - ease((t - 0.68) / 0.26);

/** The turn's sideways path, on the pass's own 0..1 clock. */
const turnAcross = (t: number): number => -ease(t / 0.3) + 2 * ease((t - 0.35) / 0.3) - ease((t - 0.72) / 0.22);
/** The nod's path, on the pass's own 0..1 clock. */
const nodDown = (t: number): number => swell(t / 0.45) - 0.7 * swell((t - 0.45) / 0.45);
/** A slight drift, nothing at either end: a real head never holds quite still. */
const drift = (t: number, size: number): number => size * Math.sin(2 * Math.PI * t) * swell(t);

/** The pose `at` seconds into one pass of `gesture`. At rest at both ends. */
export function narratorPose(gesture: NarratorGesture, at: number): NarratorPose {
  const seconds = NARRATOR_SECONDS[gesture];
  const t = at / seconds;
  // Where the head will be a moment from now, which is where the eyes look.
  const ahead = Math.min(1, t + LOOK_LEAD / seconds);
  // It arrives looking at the person, and the glance comes in from there.
  const arrived = ease(t / 0.1);
  switch (gesture) {
    case 'turn': {
      const across = turnAcross(t);
      return {
        ...NARRATOR_REST,
        across,
        down: drift(t, 0.06),
        // A quick blink as the head swings through the middle.
        eyes: 1 - swell((t - 0.44) / 0.1),
        lookX: arrived * clamp1(LOOK_REACH * turnAcross(ahead)),
      };
    }
    case 'nod': {
      const down = nodDown(t);
      return {
        ...NARRATOR_REST,
        down,
        across: drift(t, 0.05),
        // The lids follow the eyes down.
        eyes: 1 - 0.3 * Math.max(0, down),
        lookY: arrived * clamp1(LOOK_REACH * nodDown(ahead)),
      };
    }
    case 'turnLeft':
    case 'turnRight': {
      const side = gesture === 'turnLeft' ? -1 : 1;
      return {
        ...NARRATOR_REST,
        across: side * outAndBack(t),
        down: drift(t, 0.05),
        lookX: arrived * clamp1(LOOK_REACH * side * outAndBack(ahead)),
      };
    }
    case 'lookUp':
    case 'lookDown': {
      const way = gesture === 'lookUp' ? -1 : 1;
      const down = way * outAndBack(t);
      return {
        ...NARRATOR_REST,
        down,
        across: drift(t, 0.04),
        // The lids follow the eyes down, and open a touch looking up.
        eyes: 1 - 0.3 * Math.max(0, down),
        lookY: arrived * clamp1(LOOK_REACH * way * outAndBack(ahead)),
      };
    }
    case 'blink': {
      // Two quick blinks, each shutting faster than it opens, the head
      // dipping a touch with each.
      const shut = swell((t - 0.2) / 0.18) + swell((t - 0.52) / 0.18);
      return { ...NARRATOR_REST, eyes: 1 - shut, down: 0.06 * shut, across: drift(t, 0.05) };
    }
    case 'smile': {
      const smile = ease((t - 0.1) / 0.2) - ease((t - 0.75) / 0.2);
      // The cheeks lift into the eyes, and the chin comes up a little.
      return { ...NARRATOR_REST, smile, eyes: 1 - 0.3 * smile, down: -0.12 * smile, across: drift(t, 0.05) };
    }
  }
}

/** The one pose that says the gesture, for a person who asked for less motion. */
export function narratorStillPose(gesture: NarratorGesture): NarratorPose {
  switch (gesture) {
    case 'turn':
      return { ...NARRATOR_REST, across: 1, lookX: 1 };
    case 'nod':
      return { ...NARRATOR_REST, down: 1, eyes: 0.7, lookY: 1 };
    case 'turnLeft':
      return { ...NARRATOR_REST, across: -1, lookX: -1 };
    case 'turnRight':
      return { ...NARRATOR_REST, across: 1, lookX: 1 };
    case 'lookUp':
      return { ...NARRATOR_REST, down: -1, lookY: -1 };
    case 'lookDown':
      return { ...NARRATOR_REST, down: 1, eyes: 0.7, lookY: 1 };
    case 'blink':
      return { ...NARRATOR_REST, eyes: 0 };
    case 'smile':
      return { ...NARRATOR_REST, smile: 1, eyes: 0.7, down: -0.12 };
  }
}

/**
 * The gesture the narrator acts out, or null for none. Only while a gesture
 * is being asked for: never for the flash or the passive hold (neither has a
 * gesture), never while the person is asked to move into place (a position,
 * second-face or lighting warning), and never once the gesture has landed or
 * the check has failed. A workflow can switch it off
 * (`livenessGestureGuide: false`). Mirrors the web LivenessStep's
 * `narratedGesture`.
 */
export function narratedGesture({
  enabled,
  phase,
  challenge,
  movingIntoPlace,
}: {
  enabled: boolean;
  phase: LivenessPhase;
  challenge: LivenessChallenge | null;
  movingIntoPlace: boolean;
}): NarratorGesture | null {
  if (!enabled || phase !== 'challenge' || movingIntoPlace) return null;
  return challenge === 'turn' ||
    challenge === 'nod' ||
    challenge === 'blink' ||
    challenge === 'smile' ||
    isDirectionChallenge(challenge)
    ? challenge
    : null;
}

/** Whether the guide is on: only `false` turns it off. */
export function gestureGuideEnabled(config: { livenessGestureGuide?: boolean | null }): boolean {
  return config.livenessGestureGuide !== false;
}
