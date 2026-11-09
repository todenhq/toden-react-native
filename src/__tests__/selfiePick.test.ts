import { readFileSync } from 'fs';
import { join } from 'path';

import {
  SELFIE_FACE_SHARE,
  SELFIE_MAX_WIDTH,
  SELFIE_STEADY_MS,
  SelfieAngleZero,
  SelfieSteadiness,
  headPose,
  isFrontal,
  mirrorRect,
  selfieFault,
  selfieFrame,
  selfieFrameInStill,
  selfieOutputWidth,
  selfieScore,
  stillFace,
} from '../lib/selfie-pick';
import { MAX_RUN_SHOTS, RUN_SHOT_GAP_MS, SelfieCandidates } from '../lib/selfie-candidates';
import {
  CAPTURE_GIVE_UP_MS,
  CAPTURE_HOLD_MS,
  CAPTURE_WAIT_MS,
  FACE_GONE_MS,
  SelfieCaptureGate,
} from '../lib/selfie-capture-gate';
import { captureGuidanceText } from '../liveness/captureGuidance';
import { defaultText } from '../i18n/translate';
import type { LivenessFaceData } from '../liveness/types';

// The selfie chosen from the live run (user decision 2026-11-07). Mirrors the
// web SDK's lib/selfie-pick.test.ts; the pose here is the native detectors'
// head angles in degrees rather than MediaPipe landmarks.

const face = (over: Partial<LivenessFaceData> = {}): LivenessFaceData => ({
  headEulerAngleX: 0,
  headEulerAngleY: 0,
  headEulerAngleZ: 0,
  smilingProbability: 0,
  leftEyeOpenProbability: 0.9,
  rightEyeOpenProbability: 0.9,
  faceSizeRatio: 0.4,
  faceCount: 1,
  brightness: 120,
  faceCenterX: 0.5,
  faceCenterY: 0.5,
  ...over,
});

/** Candidates that have watched a still, straight face long enough to trust it. */
const settled = (options?: { poseZeroFromRun?: boolean }, rest: LivenessFaceData = face()): SelfieCandidates => {
  const c = new SelfieCandidates(options);
  for (let t = 0; t <= SELFIE_STEADY_MS; t += 60) c.observe(rest, t);
  return c;
};

describe('choosing the selfie', () => {
  it('reads a straight-on face as frontal', () => {
    expect(isFrontal(headPose(face()))).toBe(true);
    expect(selfieFault(face())).toBeNull();
  });

  it('rejects a head still turned after "turn your head"', () => {
    expect(isFrontal(headPose(face({ headEulerAngleY: 18 })))).toBe(false);
    expect(selfieFault(face({ headEulerAngleY: -18 }))).toBe('turned');
  });

  it('rejects a nod and a tilt', () => {
    expect(isFrontal(headPose(face({ headEulerAngleX: -14 })))).toBe(false);
    expect(isFrontal(headPose(face({ headEulerAngleZ: 15 })))).toBe(false);
  });

  it('wants the eyes open and the face close enough, after facing the camera', () => {
    expect(selfieFault(face({ leftEyeOpenProbability: 0.2, rightEyeOpenProbability: 0.3 }))).toBe('eyes');
    expect(selfieFault(face({ faceSizeRatio: 0.12 }))).toBe('far');
    expect(selfieFault(face({ faceSizeRatio: 0.12, headEulerAngleY: 20 }))).toBe('turned');
  });

  it('scores a squarer frame higher, and a sharper one when sharpness is known', () => {
    const straight = headPose(face());
    const turned = headPose(face({ headEulerAngleY: 6 }));
    expect(selfieScore(straight)).toBeGreaterThan(selfieScore(turned));
    expect(selfieScore(straight, 100)).toBeGreaterThan(selfieScore(straight, 20));
  });

  it('cuts a 3:4 frame with the face at its set share of the width', () => {
    const rect = selfieFrame({ x: 0.3, y: 0.3, width: 0.4, height: 0.25 }, 1080, 1920)!;
    expect(rect.width / rect.height).toBeCloseTo(0.75, 2);
    expect((0.4 * 1080) / rect.width).toBeCloseTo(SELFIE_FACE_SHARE, 2);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1920);
  });

  it('on a short landscape camera, the tallest 3:4 frame that fits', () => {
    const rect = selfieFrame({ x: 0.4, y: 0.3, width: 0.2, height: 0.3 }, 1920, 1080)!;
    expect(rect.height).toBe(1080);
    expect(rect.width).toBe(810);
  });

  it('keeps the frame inside the camera, moving it rather than squeezing', () => {
    const rect = selfieFrame({ x: 0.02, y: 0.02, width: 0.2, height: 0.3 }, 1280, 960)!;
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width / rect.height).toBeCloseTo(0.75, 2);
  });

  it('says a face too far away is no selfie, rather than enlarging it', () => {
    expect(selfieFrame({ x: 0.45, y: 0.4, width: 0.08, height: 0.12 }, 1280, 720)).toBeNull();
  });

  it('mirrors the frame for a mirrored still', () => {
    expect(mirrorRect({ x: 100, y: 0, width: 300, height: 400 }, 1000).x).toBe(600);
  });

  it('caps the selfie at 720px wide and never enlarges it', () => {
    expect(selfieOutputWidth({ x: 0, y: 0, width: 2000, height: 2667 })).toBe(SELFIE_MAX_WIDTH);
    expect(selfieOutputWidth({ x: 0, y: 0, width: 500, height: 667 })).toBe(500);
  });
});

describe('the face in the stored still', () => {
  it('flips y on iOS (Vision counts from the bottom, already mirrored)', () => {
    expect(stillFace(face({ faceCenterX: 0.4, faceCenterY: 0.3 }), 'ios')).toEqual({ centreX: 0.4, centreY: 0.7, width: 0.4 });
  });

  it('flips x on Android (ML Kit reads the unmirrored sensor)', () => {
    expect(stillFace(face({ faceCenterX: 0.4, faceCenterY: 0.3 }), 'android')).toEqual({ centreX: 0.6, centreY: 0.3, width: 0.4 });
  });

  it('has nothing to cut around without a centre', () => {
    expect(stillFace(face({ faceCenterX: undefined }), 'ios')).toBeNull();
  });

  it('puts the face centre 46% down the cut', () => {
    const rect = selfieFrameInStill({ centreX: 0.5, centreY: 0.45, width: 0.4 }, 3024, 4032)!;
    expect(rect.width / rect.height).toBeCloseTo(0.75, 2);
    expect((0.45 * 4032 - rect.y) / rect.height).toBeCloseTo(0.46, 2);
  });
});

describe('the best still of the run', () => {
  it('asks for a still on a new best frame, rationed', () => {
    const c = settled();
    const first = c.consider(face({ headEulerAngleY: 6 }));
    expect(first.verdict).toBe('kept');
    const shot = c.shoot(first.verdict, first.score, 0)!;
    expect(shot).not.toBeNull();
    // One at a time, and a gap between them.
    const better = c.consider(face({ headEulerAngleY: 2 }));
    expect(c.shoot(better.verdict, better.score, RUN_SHOT_GAP_MS + 1)).toBeNull();
    expect(c.land(shot, 'file://a.jpg', null)).toBe(true);
    expect(c.best?.uri).toBe('file://a.jpg');
    const next = c.consider(face());
    expect(c.shoot(next.verdict, next.score, RUN_SHOT_GAP_MS - 1)).toBeNull();
    expect(c.shoot(next.verdict, next.score, 2 * RUN_SHOT_GAP_MS)).not.toBeNull();
  });

  it('never takes more than the ration in one run', () => {
    const c = settled();
    let taken = 0;
    for (let i = 0; i < 10; i++) {
      c.clear();
      for (let t = 0; t <= SELFIE_STEADY_MS; t += 60) c.observe(face(), t);
      const r = c.consider(face());
      const shot = c.shoot(r.verdict, r.score, i * 10 * RUN_SHOT_GAP_MS);
      if (shot) taken++;
    }
    expect(taken).toBe(MAX_RUN_SHOTS);
  });

  it('drops a still from a broken run, or one that landed on a turned face', () => {
    const c = settled();
    const r = c.consider(face());
    const shot = c.shoot(r.verdict, r.score, 0)!;
    c.clear();
    expect(c.land(shot, 'file://a.jpg', null)).toBe(false);
    expect(c.best).toBeNull();

    const c2 = settled();
    const r2 = c2.consider(face());
    const shot2 = c2.shoot(r2.verdict, r2.score, 0)!;
    c2.consider(face({ headEulerAngleY: 25 }));
    expect(c2.land(shot2, 'file://b.jpg', null)).toBe(false);
  });
});

describe('the resting pose and holding still', () => {
  it("reads pitch and roll from the run's resting pose on iPhone, yaw from true zero", () => {
    // A phone held below the face: Vision reads a steady 14° nod.
    const low = face({ headEulerAngleX: -14, headEulerAngleZ: 4 });
    expect(selfieFault(low)).toBe('turned');
    const ios = settled({ poseZeroFromRun: true }, low);
    expect(ios.consider(low).verdict).toBe('kept');
    // A real turn is still a turn, whatever the resting pose.
    ios.observe(face({ headEulerAngleX: -14, headEulerAngleY: 18 }), 400);
    expect(ios.consider(face({ headEulerAngleX: -14, headEulerAngleY: 18 })).verdict).toBe('turned');
    // Android keeps the true zero.
    const android = settled({ poseZeroFromRun: false }, low);
    expect(android.consider(low).verdict).toBe('turned');
  });

  it('takes the median, so a nod either side of rest does not move it', () => {
    const zero = new SelfieAngleZero(true);
    for (let i = 0; i < 20; i++) zero.add(face({ headEulerAngleX: -12 }));
    for (const x of [-30, 6, -30, 6]) zero.add(face({ headEulerAngleX: x }));
    expect(zero.zero.pitch).toBe(-12);
    expect(new SelfieAngleZero(false).zero).toEqual({ pitch: 0, roll: 0 });
  });

  it('is steady only once the face has stayed put for the window', () => {
    const steady = new SelfieSteadiness();
    steady.add(face(), 0);
    expect(steady.steady).toBe(false);
    for (let t = 60; t <= SELFIE_STEADY_MS; t += 60) steady.add(face({ faceCenterX: 0.5 + t / 100000 }), t);
    expect(steady.steady).toBe(true);
  });

  it('is not steady while the phone swings up, and is after it settles', () => {
    const s = new SelfieSteadiness();
    // Sweeping up the frame at a face-width every 300ms.
    for (let t = 0; t <= 600; t += 60) s.add(face({ faceCenterY: 0.9 - t / 750 }), t);
    expect(s.steady).toBe(false);
    for (let t = 660; t <= 660 + SELFIE_STEADY_MS; t += 60) s.add(face({ faceCenterY: 0.1 }), t);
    expect(s.steady).toBe(true);
    // A lunge at the camera or a turn is movement too.
    s.add(face({ faceCenterY: 0.1, faceSizeRatio: 0.5 }), 1100);
    expect(s.steady).toBe(false);
  });

  it('forgives one stray reading among several still ones', () => {
    const s = new SelfieSteadiness();
    for (let t = 0; t <= SELFIE_STEADY_MS; t += 60) s.add(t === 120 ? face({ faceCenterX: 0.6 }) : face(), t);
    expect(s.steady).toBe(true);
  });

  it('marks a straight face that has not held still as moving', () => {
    const c = new SelfieCandidates();
    c.observe(face(), 0);
    expect(c.consider(face()).verdict).toBe('moving');
  });

  it('a still, straight face fires within about a second of settling', () => {
    // Detector at 15fps; the resting pose sits 13° off the absolute zero, and
    // pitch jitters ±4° with one wild reading.
    const c = new SelfieCandidates({ poseZeroFromRun: true });
    const gate = new SelfieCaptureGate();
    let fired: number | null = null;
    for (let i = 0; i < 60 && fired == null; i++) {
      const now = 1000 + i * 66;
      const f = face({ headEulerAngleX: i === 9 ? 30 : -13 + ((i * 7) % 9) - 4 });
      c.observe(f, now);
      const { verdict } = c.consider(f);
      if (gate.frame({ verdict, placed: true, hasBest: false, now }).fire === 'live') fired = now - 1000;
    }
    expect(fired).not.toBeNull();
    expect(fired!).toBeLessThanOrEqual(1000);
  });
});

describe('the final shutter', () => {
  it('waits for frames that could be the selfie, held for half a second', () => {
    const gate = new SelfieCaptureGate();
    for (let t = 0; t < CAPTURE_HOLD_MS; t += 60) {
      expect(gate.frame({ verdict: 'worse', placed: true, hasBest: false, now: 1 + t })).toEqual({ fire: null, guidance: null });
    }
    expect(gate.frame({ verdict: 'kept', placed: true, hasBest: false, now: 1 + CAPTURE_HOLD_MS })).toEqual({ fire: 'live' });
    expect(gate.hasFired).toBe(true);
  });

  it('forgives one stray frame in the hold, not two', () => {
    const gate = new SelfieCaptureGate();
    gate.frame({ verdict: 'worse', placed: true, hasBest: false, now: 1 });
    gate.frame({ verdict: 'worse', placed: true, hasBest: false, now: 100 });
    // A single jittery reading: no restart, and no "look straight" flicker.
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: false, now: 200 })).toEqual({ fire: null, guidance: null });
    gate.frame({ verdict: 'worse', placed: true, hasBest: false, now: 300 });
    // Never fired on the stray itself; on the next good frame once held.
    expect(gate.frame({ verdict: 'worse', placed: true, hasBest: false, now: 1 + CAPTURE_HOLD_MS })).toEqual({ fire: 'live' });

    const strict = new SelfieCaptureGate();
    strict.frame({ verdict: 'worse', placed: true, hasBest: false, now: 1 });
    strict.frame({ verdict: 'turned', placed: true, hasBest: false, now: 100 });
    expect(strict.frame({ verdict: 'turned', placed: true, hasBest: false, now: 200 })).toEqual({ fire: null, guidance: 'lookStraight' });
    // The hold starts again from the next good frame.
    strict.frame({ verdict: 'worse', placed: true, hasBest: false, now: 300 });
    expect(strict.frame({ verdict: 'worse', placed: true, hasBest: false, now: 1 + CAPTURE_HOLD_MS }).fire).toBeNull();
    expect(strict.frame({ verdict: 'worse', placed: true, hasBest: false, now: 300 + CAPTURE_HOLD_MS }).fire).toBe('live');
  });

  it('asks a moving face to hold still', () => {
    const gate = new SelfieCaptureGate();
    expect(gate.frame({ verdict: 'moving', placed: true, hasBest: false, now: 1 })).toEqual({ fire: null, guidance: 'holdStill' });
  });

  it('says what to fix: look straight, move closer, or the placement', () => {
    const gate = new SelfieCaptureGate();
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: false, now: 1 })).toEqual({ fire: null, guidance: 'lookStraight' });
    expect(gate.frame({ verdict: 'far', placed: true, hasBest: false, now: 2 })).toEqual({ fire: null, guidance: 'moveCloser' });
    expect(gate.frame({ verdict: 'kept', placed: false, hasBest: false, now: 3 })).toEqual({ fire: null, guidance: 'position' });
    expect(captureGuidanceText('lookStraight', face(), null, defaultText)).toBe('Kindly look straight at the camera');
    expect(captureGuidanceText('moveCloser', face(), null, defaultText)).toBe('Kindly move closer');
  });

  it("uses the run's best still once the person has had a fair chance", () => {
    const gate = new SelfieCaptureGate();
    gate.frame({ verdict: 'turned', placed: true, hasBest: true, now: 1 });
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: true, now: CAPTURE_WAIT_MS }).fire).toBeNull();
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: true, now: CAPTURE_WAIT_MS + 2 }).fire).toBe('best');
  });

  it('with no still from the run, takes a placed face only after the long wait', () => {
    const gate = new SelfieCaptureGate();
    gate.frame({ verdict: 'turned', placed: true, hasBest: false, now: 1 });
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: false, now: CAPTURE_WAIT_MS + 2 }).fire).toBeNull();
    expect(gate.frame({ verdict: 'turned', placed: true, hasBest: false, now: CAPTURE_GIVE_UP_MS + 2 }).fire).toBe('live');
  });

  it('breaks the run when the face is gone for a second', () => {
    const gate = new SelfieCaptureGate();
    gate.frame({ verdict: 'kept', placed: true, hasBest: false, now: 1000 });
    expect(gate.noFace(1000, 1000 + FACE_GONE_MS)).toBe(false);
    expect(gate.noFace(1000, 1001 + FACE_GONE_MS)).toBe(true);
  });
});

describe('the wiring', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('scores frames through the gestures and the capture, and clears on a broken run', () => {
    const hook = read('liveness/useLiveness.ts');
    expect(hook).toContain("if (s.phase === 'challenge' || s.phase === 'capturing') {");
    expect(hook).toMatch(/integrityBrokenRef\.current = true;\s*\/\/ The selfie must come from one unbroken run of one face\.\s*selfiesRef\.current\.clear\(\);/);
    expect(hook).toContain("failureReason: 'face_lost'");
    // Every face feeds the resting pose and stillness; the resting pose is iPhone's.
    expect(hook).toContain('selfiesRef.current.observe(data, Date.now());');
    expect(hook).toContain("new SelfieCandidates({ poseZeroFromRun: Platform.OS === 'ios' })");
  });

  it('takes the run stills silently and cuts every selfie to the standard frame', () => {
    const stills = read('screens/liveness/useSelfieStills.ts');
    expect(stills).toContain('enableShutterSound: false');
    expect(stills).toContain('cutSelfie(raw, face)');
  });

  it('shows the selfie as a 3:4 rounded rectangle, not a circle', () => {
    for (const rel of ['screens/liveness/SelfiePreview.tsx', 'screens/liveness/LivenessReview.tsx']) {
      const src = read(rel);
      expect(src).toContain('SELFIE_ASPECT');
      expect(src).not.toMatch(/borderRadius: (S|window\.width) \/ 2/);
    }
  });
});
