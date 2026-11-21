// ---------------------------------------------------------------------------
// Which way the head is facing, for the head directions gesture set: turned
// to the person's own left or right, looking up or down. Pure.
//
// The web SDK reads this off MediaPipe landmarks (gesture-detector/
// directions.ts); this SDK has the native detector's head angles instead
// (Apple Vision on iOS, ML Kit on Android), so the lines are in degrees:
//
//   turn   yaw past TURN_DEGREES, the classic turn's own line (gestureDetector
//          detectTurn), signed. Positive yaw is the person's own LEFT
//          (LivenessFaceData). On the mirrored preview their left is the
//          screen's left too, so "turn your head to the left" means the same
//          thing whichever way they read it.
//   look   pitch moved LOOK_DEGREES from the person's own resting pitch, taken
//          as they hold still before the first gesture. The web's line is
//          "about fifteen degrees"; faces and phones rest at different
//          pitches, which is why it is measured from rest. Positive pitch is
//          up.
//
// The larger of the two movements, each against its own line, wins, so a turn
// with a slight dip is still a turn.
// ---------------------------------------------------------------------------

import type { ChallengeTracker } from './challengeManager';
import { isDirectionChallenge, type DirectionChallenge, type LivenessChallenge, type LivenessFaceData, type LivenessPhase } from './types';

/** Yaw, in degrees, that counts as a turn: the classic turn's own line. */
export const TURN_DEGREES = 25;
/** Pitch from rest, in degrees, that counts as looking up or down. */
export const LOOK_DEGREES = 15;
/**
 * A direction must hold for this many detected frames in a row, so a passing
 * wobble is not taken for the gesture: the web's and Flutter's four. The
 * native detector drops frames while it is busy, so here that is somewhat
 * longer than the web's tenth of a second.
 */
export const DIRECTION_HOLD_FRAMES = 4;
/** A head held the wrong way this long is shown the way again (the web's
 *  thirty frames, about a second, timed here because the frame rate varies). */
export const WRONG_WAY_MS = 1000;

export type Facing = DirectionChallenge | null;

/**
 * The one direction the head is plainly facing, or null when it is facing the
 * camera. `restPitch` is the person's own pitch at rest.
 */
export function facing(face: Pick<LivenessFaceData, 'headEulerAngleX' | 'headEulerAngleY'>, restPitch: number): Facing {
  const yaw = face.headEulerAngleY;
  const pitch = face.headEulerAngleX - restPitch;
  const turned = Math.abs(yaw) / TURN_DEGREES;
  const tilted = Math.abs(pitch) / LOOK_DEGREES;
  if (turned < 1 && tilted < 1) return null;
  if (turned >= tilted) return yaw > 0 ? 'turnLeft' : 'turnRight';
  return pitch > 0 ? 'lookUp' : 'lookDown';
}

/** The direction straight across from one: what "the wrong way" is. */
export function oppositeDirection(direction: DirectionChallenge): DirectionChallenge {
  switch (direction) {
    case 'turnLeft':
      return 'turnRight';
    case 'turnRight':
      return 'turnLeft';
    case 'lookUp':
      return 'lookDown';
    case 'lookDown':
      return 'lookUp';
  }
}

/**
 * One direction being asked for, frame by frame. The wrong way is never a
 * failure and never a red warning: it does not count, and after WRONG_WAY_MS
 * of it `wrongWay` comes back true once, for the narrator to show the way
 * again. Reset it for each new direction.
 */
export class DirectionWatch {
  private held = 0;
  private wrongSince: number | null = null;
  private wrongShown = false;

  reset(): void {
    this.held = 0;
    this.wrongSince = null;
    this.wrongShown = false;
  }

  /** One frame: whether the direction is done, and whether to show the way again now. */
  frame(
    expected: DirectionChallenge,
    face: Pick<LivenessFaceData, 'headEulerAngleX' | 'headEulerAngleY'>,
    restPitch: number,
    now: number,
  ): { done: boolean; wrongWay: boolean } {
    const way = facing(face, restPitch);
    if (way === expected) {
      this.wrongSince = null;
      this.wrongShown = false;
      this.held += 1;
      if (this.held >= DIRECTION_HOLD_FRAMES) {
        this.held = 0;
        return { done: true, wrongWay: false };
      }
      return { done: false, wrongWay: false };
    }
    this.held = 0;
    if (way !== oppositeDirection(expected)) {
      this.wrongSince = null;
      this.wrongShown = false;
      return { done: false, wrongWay: false };
    }
    if (this.wrongSince === null) this.wrongSince = now;
    if (!this.wrongShown && now - this.wrongSince >= WRONG_WAY_MS) {
      this.wrongShown = true;
      return { done: false, wrongWay: true };
    }
    return { done: false, wrongWay: false };
  }
}

/**
 * The head directions of the run, for the four-sided line round the window
 * (screens/liveness/SideRing): the direction asked for now (null between
 * them), those done, and all the run asks for.
 */
export interface DirectionSides {
  asked: DirectionChallenge | null;
  done: DirectionChallenge[];
  directions: DirectionChallenge[];
}

/**
 * The run's head directions for the four-sided line, or null when the run
 * asks none. A side is asked only while its direction is being asked for.
 */
export function directionSidesOf(
  tracker: Pick<ChallengeTracker, 'all'>,
  phase: LivenessPhase,
  active: LivenessChallenge | null,
): DirectionSides | null {
  const directions = tracker.all.map((e) => e.config.type).filter(isDirectionChallenge);
  if (directions.length === 0) return null;
  const done = tracker.all
    .filter((e) => e.progress === 'passed')
    .map((e) => e.config.type)
    .filter(isDirectionChallenge);
  return { asked: phase === 'challenge' && isDirectionChallenge(active) ? active : null, done, directions };
}
