import { ResponseWatch } from '../liveness/responseWatch';
import type { LivenessFaceData } from '../liveness/types';

// ─── Whether the person is responding to a gesture ───────────────────────────
//
// The web SDK's cases (liveness/response-watch.test.ts), told in the native
// detector's own signals: yaw and pitch in degrees, smile and eye-open
// probabilities.

function face({ turn = 0, nod = 0, smile = 0.05, eyes = 0.95 } = {}): LivenessFaceData {
  return {
    headEulerAngleX: nod,
    headEulerAngleY: turn,
    headEulerAngleZ: 0,
    smilingProbability: smile,
    leftEyeOpenProbability: eyes,
    rightEyeOpenProbability: eyes,
    faceSizeRatio: 0.4,
    faceCount: 1,
    brightness: 120,
  };
}

describe('watching whether the person is responding', () => {
  it('a still face has not responded, however long it is watched', () => {
    const watch = new ResponseWatch();
    for (let frame = 0; frame < 300; frame++) watch.seen(face(), frame * 33);
    expect(watch.respondedAt).toBe(0);
  });

  it.each([
    ['a turn', { turn: 15 }],
    ['a nod', { nod: -8 }],
    ['a smile', { smile: 0.7 }],
    ['a blink', { eyes: 0.1 }],
  ])('%s is a response, timed when it was seen', (_, attempt) => {
    const watch = new ResponseWatch();
    watch.seen(face(), 0);
    watch.seen(face(), 33);
    watch.seen(face(attempt), 66);
    expect(watch.respondedAt).toBe(66);
  });

  it('the detector’s jitter is not a response', () => {
    const watch = new ResponseWatch();
    for (let frame = 0; frame < 120; frame++) {
      const wobble = frame % 2 === 0 ? 1 : -1;
      watch.seen(
        face({ turn: 2 * wobble, nod: 1.5 * wobble, smile: 0.05 + 0.06 * wobble, eyes: 0.9 + 0.08 * wobble }),
        frame * 33,
      );
    }
    expect(watch.respondedAt).toBe(0);
  });

  it('a face that drifts slowly is re-learnt, not taken for an attempt', () => {
    const watch = new ResponseWatch();
    for (let frame = 0; frame < 400; frame++) watch.seen(face({ turn: frame * 0.02 }), frame * 33);
    expect(watch.respondedAt).toBe(0);
  });

  it('coming back from a gesture is a response too, and holding it is not', () => {
    const watch = new ResponseWatch();
    watch.seen(face(), 0);
    watch.seen(face({ turn: 20 }), 100);
    for (let at = 200; at <= 2000; at += 100) watch.seen(face({ turn: 20 }), at);
    expect(watch.respondedAt).toBe(100);
    watch.seen(face(), 2100);
    expect(watch.respondedAt).toBe(2100);
  });

  it('starts again with nothing known', () => {
    const watch = new ResponseWatch();
    watch.seen(face(), 0);
    watch.seen(face({ nod: -8 }), 40);
    watch.reset();
    expect(watch.respondedAt).toBe(0);
    watch.seen(face({ nod: -8 }), 80);
    expect(watch.respondedAt).toBe(0);
  });
});
