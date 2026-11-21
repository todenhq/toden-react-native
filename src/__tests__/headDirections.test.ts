// expo-speech is an ESM native module the pure pieces below never reach for;
// stubbed as the other liveness tests do.
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ChallengeTracker,
  DEFAULT_DIRECTION_COUNT,
  pickChallenges,
  pickDirections,
  planChallenges,
  planRequestFor,
} from '../liveness/challengeManager';
import {
  DIRECTION_HOLD_FRAMES,
  DirectionWatch,
  directionSidesOf,
  facing,
  LOOK_DEGREES,
  oppositeDirection,
  TURN_DEGREES,
  WRONG_WAY_MS,
} from '../liveness/directions';
import { narratedGesture } from '../liveness/narratorPose';
import { READY_PAUSE_MS, readyPauseStep } from '../liveness/readyPause';
import { challengeInstruction, DIRECTION_CHALLENGES, isDirectionChallenge } from '../liveness/types';
import { PAUSE_BETWEEN_PHRASES_MS } from '../liveness/speech';
import { mergeWorkflowConfig } from '../config/workflowMerge';

// ─── Head directions (livenessGestureSet: 'directions') ─────────────────────
//
// The web SDK's set (liveness/challenge-manager.ts, gesture-detector/
// directions.ts), read off this SDK's native head angles.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/** A random source that plays back the given numbers, then repeats the last. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe('pickDirections', () => {
  it('asks the count it is given, 2 to 4, and 3 for anything else', () => {
    expect(pickDirections(2)).toHaveLength(2);
    expect(pickDirections(3)).toHaveLength(3);
    expect(pickDirections(4)).toHaveLength(4);
    expect(DEFAULT_DIRECTION_COUNT).toBe(3);
    for (const bad of [1, 5, 2.5, Number.NaN, 0]) expect(pickDirections(bad)).toHaveLength(3);
  });

  it('always includes a head turn, and never asks one direction twice', () => {
    for (let run = 0; run < 300; run++) {
      const count = 2 + (run % 3);
      const types = pickDirections(count).map((c) => c.type);
      expect(types.some((t) => t === 'turnLeft' || t === 'turnRight')).toBe(true);
      expect(new Set(types).size).toBe(types.length);
      expect(types.every(isDirectionChallenge)).toBe(true);
    }
  });

  it('picks the turn and the rest from its random source', () => {
    // 0 picks turnLeft; the rest from turnRight, lookUp, lookDown in that order.
    expect(pickDirections(2, seq(0, 0)).map((c) => c.type)).toEqual(['turnLeft', 'turnRight']);
    // 0.99 picks turnRight; then 0.99 swaps lookDown to the front.
    expect(pickDirections(2, seq(0.99, 0.99)).map((c) => c.type)).toEqual(['turnRight', 'lookDown']);
  });
});

describe('pickChallenges with head directions', () => {
  it('asks directions, in the count set, with the workflow’s timeout', () => {
    const picked = pickChallenges({ gestureSet: 'directions', directionCount: 4, timeoutPerChallenge: 9 });
    expect(picked).toHaveLength(4);
    expect(picked.every((c) => isDirectionChallenge(c.type) && c.timeoutSeconds === 9)).toBe(true);
    expect(pickChallenges({ gestureSet: 'directions' })).toHaveLength(3);
  });

  it('leaves the classic gestures, the flash and the passive hold as they were', () => {
    const classic = pickChallenges({ gestureSet: 'classic', challengeCount: 2 }).map((c) => c.type);
    expect(classic.every((t) => ['nod', 'turn', 'blink', 'smile'].includes(t))).toBe(true);
    expect(pickChallenges({}).every((c) => !isDirectionChallenge(c.type))).toBe(true);
    expect(pickChallenges({ gestureSet: 'directions', mode: 'flash' })).toEqual([]);
    expect(pickChallenges({ gestureSet: 'directions', mode: 'passive' }).map((c) => c.type)).toEqual(['hold']);
  });

  it('runs directions in Dual Check too, the flash being a phase of its own here', () => {
    const both = pickChallenges({ gestureSet: 'directions', mode: 'both' });
    expect(both.every((c) => isDirectionChallenge(c.type))).toBe(true);
  });

  it('asks Core for a head-direction plan where directions run, and no gestures where none run', () => {
    expect(planRequestFor({ gestureSet: 'directions' })?.set).toBe('directions');
    expect(planRequestFor({ gestureSet: 'directions', mode: 'both' })?.set).toBe('directions');
    expect(planRequestFor({ gestureSet: 'directions', mode: 'flash' })?.set).toBe('none');
    expect(planRequestFor({ gestureSet: 'directions', mode: 'passive' })).toBeNull();
    expect(planRequestFor({ gestureSet: 'classic' })?.set).toBe('classic');
    expect(planRequestFor(undefined)?.set).toBe('classic');
  });

  it('builds a plan’s challenges in its order, with nothing appended', () => {
    expect(planChallenges(['lookDown', 'turnRight']).map((c) => c.type)).toEqual(['lookDown', 'turnRight']);
    expect(planChallenges(['turnLeft', 'lookUp'], { mode: 'both' }).map((c) => c.type)).toEqual(['turnLeft', 'lookUp']);
  });
});

describe('which way the head is facing', () => {
  const at = (yaw: number, pitch: number) => ({ headEulerAngleY: yaw, headEulerAngleX: pitch });

  it('reads a turn as the person’s own left or right (positive yaw is their left)', () => {
    expect(facing(at(TURN_DEGREES + 1, 0), 0)).toBe('turnLeft');
    expect(facing(at(-(TURN_DEGREES + 1), 0), 0)).toBe('turnRight');
    expect(facing(at(TURN_DEGREES - 1, 0), 0)).toBeNull();
  });

  it('reads up and down from the person’s own resting pitch', () => {
    expect(facing(at(0, 8 + LOOK_DEGREES + 1), 8)).toBe('lookUp');
    expect(facing(at(0, 8 - LOOK_DEGREES - 1), 8)).toBe('lookDown');
    // Resting at 8 degrees: 20 is only 12 from rest, not yet a look up.
    expect(facing(at(0, 20), 8)).toBeNull();
  });

  it('lets the larger movement win, so a turn with a dip is still a turn', () => {
    expect(facing(at(40, -16), 0)).toBe('turnLeft');
    expect(facing(at(26, -30), 0)).toBe('lookDown');
  });

  it('knows each direction’s opposite', () => {
    expect(DIRECTION_CHALLENGES.map(oppositeDirection)).toEqual(['turnRight', 'turnLeft', 'lookDown', 'lookUp']);
  });
});

describe('DirectionWatch', () => {
  const left = { headEulerAngleY: 35, headEulerAngleX: 0 };
  const right = { headEulerAngleY: -35, headEulerAngleX: 0 };
  const ahead = { headEulerAngleY: 0, headEulerAngleX: 0 };

  it('passes once the direction has held for a few frames in a row', () => {
    const watch = new DirectionWatch();
    for (let i = 1; i < DIRECTION_HOLD_FRAMES; i++) expect(watch.frame('turnLeft', left, 0, i).done).toBe(false);
    expect(watch.frame('turnLeft', left, 0, 99).done).toBe(true);
  });

  it('starts the hold again when the head comes back between frames', () => {
    const watch = new DirectionWatch();
    watch.frame('turnLeft', left, 0, 0);
    watch.frame('turnLeft', ahead, 0, 1);
    expect(watch.frame('turnLeft', left, 0, 2).done).toBe(DIRECTION_HOLD_FRAMES <= 1);
  });

  it('never fails the wrong way: after a second of it, it shows the way again, once', () => {
    const watch = new DirectionWatch();
    expect(watch.frame('turnLeft', right, 0, 0)).toEqual({ done: false, wrongWay: false });
    expect(watch.frame('turnLeft', right, 0, WRONG_WAY_MS - 1).wrongWay).toBe(false);
    expect(watch.frame('turnLeft', right, 0, WRONG_WAY_MS)).toEqual({ done: false, wrongWay: true });
    expect(watch.frame('turnLeft', right, 0, WRONG_WAY_MS * 3).wrongWay).toBe(false);
    // Facing the camera again, then the wrong way again: a fresh second.
    watch.frame('turnLeft', ahead, 0, WRONG_WAY_MS * 4);
    watch.frame('turnLeft', right, 0, WRONG_WAY_MS * 5);
    expect(watch.frame('turnLeft', right, 0, WRONG_WAY_MS * 6).wrongWay).toBe(true);
  });

  it('does not count looking up as the wrong way for a turn', () => {
    const watch = new DirectionWatch();
    const up = { headEulerAngleY: 0, headEulerAngleX: 30 };
    watch.frame('turnLeft', up, 0, 0);
    expect(watch.frame('turnLeft', up, 0, WRONG_WAY_MS * 2).wrongWay).toBe(false);
  });
});

describe('the four sides from the run', () => {
  it('lights the direction asked while it is asked, and keeps the done ones', () => {
    const tracker = new ChallengeTracker(planChallenges(['turnLeft', 'lookUp', 'lookDown']));
    expect(directionSidesOf(tracker, 'challenge', 'turnLeft')).toEqual({
      asked: 'turnLeft',
      done: [],
      directions: ['turnLeft', 'lookUp', 'lookDown'],
    });
    tracker.markCurrentPassed();
    tracker.advance();
    expect(directionSidesOf(tracker, 'challenge_passed', 'turnLeft')).toEqual({
      asked: null,
      done: ['turnLeft'],
      directions: ['turnLeft', 'lookUp', 'lookDown'],
    });
  });

  it('is nothing for a run with no directions', () => {
    expect(directionSidesOf(new ChallengeTracker(pickChallenges({ challengeCount: 2 })), 'challenge', 'turn')).toBeNull();
  });
});

describe('the words for each direction', () => {
  it('are the web SDK’s, shown and spoken', () => {
    expect(challengeInstruction('turnLeft')).toBe('Turn your head to the left');
    expect(challengeInstruction('turnRight')).toBe('Turn your head to the right');
    expect(challengeInstruction('lookUp')).toBe('Look up');
    expect(challengeInstruction('lookDown')).toBe('Look down');
  });

  it('are acted out by the narrator', () => {
    for (const challenge of DIRECTION_CHALLENGES) {
      expect(narratedGesture({ enabled: true, phase: 'challenge', challenge, movingIntoPlace: false })).toBe(challenge);
    }
  });
});

describe('the ready pause before the first gesture', () => {
  it('starts, holds for a moment, then lets the first gesture be asked', () => {
    const start = readyPauseStep(null, 1000);
    expect(start).toEqual({ readyAt: 1000, go: false });
    expect(readyPauseStep(1000, 1000 + READY_PAUSE_MS - 1)).toEqual({ readyAt: 1000, go: false });
    expect(readyPauseStep(1000, 1000 + READY_PAUSE_MS)).toEqual({ readyAt: null, go: true });
    expect(READY_PAUSE_MS).toBe(1500);
  });

  it('says "Hold still" during it, and starts it again when the face leaves its place', () => {
    const hook = read('liveness/useLiveness.ts');
    expect(hook).toContain("(tRef.current ?? defaultText)('presence.position.holdStill')");
    expect(hook).toMatch(/Out of place: the pause starts again[\s\S]*leaveReadyPause\(\);/);
    expect(hook).toContain('const ready = readyPauseStep(readyAtRef.current, now);');
  });
});

describe('prompts a breath apart', () => {
  it('leaves the web’s pause between two spoken prompts', () => {
    expect(PAUSE_BETWEEN_PHRASES_MS).toBe(700);
  });
});

describe('the workflow’s setting reaches the camera', () => {
  it('carries the set and the count through the merge', () => {
    const merged = mergeWorkflowConfig(
      { livenessGestureSet: 'directions', livenessDirectionCount: 2 },
      {} as Record<string, unknown>,
    );
    expect(merged.livenessGestureSet).toBe('directions');
    expect(merged.livenessDirectionCount).toBe(2);
  });

  it('is passed to the liveness machine with Core’s plan request', () => {
    const step = read('screens/LivenessStep.tsx');
    expect(step).toContain('gestureSet: config.livenessGestureSet,');
    expect(step).toContain('directionCount: config.livenessDirectionCount,');
    expect(step).toContain('const requestDirectionPlan = useCallback((plan: PlanRequest) => api.livenessDirections(plan), [api]);');
    expect(step).toContain('liveness.directionPlanId(),');
  });
});
