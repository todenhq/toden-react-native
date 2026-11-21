import { readFileSync } from 'fs';
import { join } from 'path';

import { windowRect, type Size } from '../lib/livenessCutout';
import {
  faceShareBox,
  REVIEW_FACE_MAX_FILL,
  sceneFades,
  sceneOnReview,
  uncovered,
  type ShareBox,
} from '../lib/selfie-review';

// ─── The whole still on the selfie review ────────────────────────────────────
//
// The web SDK's lib/selfie-review.test.ts and the Flutter SDK's
// selfie_review_test.dart, on this SDK's phone windows: the face always inside
// the window and at most 0.8 of it, the picture exactly as the camera drew it
// when the face was placed, smaller (never larger) for a face held too close,
// and central where the picture allows.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/** A phone still, upright. */
const STILL: Size = { width: 1080, height: 1440 };
const SCREENS: Record<string, Size> = {
  phone: { width: 393, height: 852 },
  'small phone': { width: 360, height: 640 },
};
const FACES: Record<string, number> = { placed: 0.6, close: 0.95, 'very close': 1.3 };

/** A face taking `fill` of the window's width when drawn as the camera drew it. */
function faceBox(frame: Size, scene: Size, fill: number, x = 0.5, y = 0.5): ShareBox {
  const cover = Math.max(frame.width / scene.width, frame.height / scene.height);
  const width = (fill * windowRect(frame).width) / (scene.width * cover);
  const height = (width * scene.width * 1.3) / scene.height;
  return { x: x - width / 2, y: y - height / 2, width, height };
}

describe('sceneOnReview', () => {
  for (const [name, frame] of Object.entries(SCREENS)) {
    const window = windowRect(frame);
    for (const [held, share] of Object.entries(FACES)) {
      for (const [cx, cy] of [
        [0.5, 0.5],
        [0.42, 0.56],
      ] as const) {
        it(`keeps the face inside the window on a ${name}, face ${held}, at ${cx},${cy}`, () => {
          const face = faceBox(frame, STILL, share, cx, cy);
          if (face.x < 0 || face.y < 0 || face.x + face.width > 1 || face.y + face.height > 1) return;
          const at = sceneOnReview(STILL, face, frame, window);
          const left = at.x + face.x * at.width;
          const up = at.y + face.y * at.height;
          const wide = face.width * at.width;
          const tall = face.height * at.height;
          expect(wide).toBeLessThanOrEqual(window.width * REVIEW_FACE_MAX_FILL + 0.01);
          expect(tall).toBeLessThanOrEqual(window.height * REVIEW_FACE_MAX_FILL + 0.01);
          expect(left).toBeGreaterThanOrEqual(window.x - 0.01);
          expect(left + wide).toBeLessThanOrEqual(window.x + window.width + 0.01);
          expect(up).toBeGreaterThanOrEqual(window.y - 0.01);
          expect(up + tall).toBeLessThanOrEqual(window.y + window.height + 0.01);
        });
      }
    }

    it(`shows a ${name} as the camera did when the face was placed in the window`, () => {
      const at = sceneOnReview(STILL, faceBox(frame, STILL, FACES.placed!), frame, window);
      const cover = Math.max(frame.width / STILL.width, frame.height / STILL.height);
      expect(at.width).toBeCloseTo(STILL.width * cover, 6);
      expect(uncovered(at, frame)).toEqual({ left: false, right: false, top: false, bottom: false });
    });
  }

  it('makes the picture smaller, never larger, for a face held too close', () => {
    const frame = SCREENS.phone!;
    const window = windowRect(frame);
    const at = sceneOnReview(STILL, faceBox(frame, STILL, 1.3), frame, window);
    const cover = Math.max(frame.width / STILL.width, frame.height / STILL.height);
    expect(at.width).toBeLessThan(STILL.width * cover);
    const gaps = uncovered(at, frame);
    expect(gaps.top && gaps.bottom).toBe(true);
  });

  it('moves a face that had drifted back to the centre where the picture allows', () => {
    const frame = SCREENS.phone!;
    const window = windowRect(frame);
    const face = faceBox(frame, STILL, 0.6, 0.47);
    const at = sceneOnReview(STILL, face, frame, window);
    expect(at.x + (face.x + face.width / 2) * at.width).toBeCloseTo(frame.width / 2, 6);
    const gaps = uncovered(at, frame);
    expect(gaps.left || gaps.right).toBe(false);
  });
});

describe('faceShareBox', () => {
  it("takes the detectors' face box as about square in pixels, round the detector's centre", () => {
    const box = faceShareBox({ centreX: 0.5, centreY: 0.4, width: 0.3 }, 1080, 1440);
    expect(box.width * 1080).toBeCloseTo(box.height * 1440, 9);
    expect(box.x + box.width / 2).toBeCloseTo(0.5, 9);
    expect(box.y + box.height / 2).toBeCloseTo(0.4, 9);
  });
});

describe('sceneFades', () => {
  const frame = { width: 393, height: 852 };

  it('fades nothing where the picture covers the screen', () => {
    expect(sceneFades({ x: -20, y: 0, width: 640, height: 852 }, frame)).toEqual([]);
  });

  it('fades each edge that stops short, from the background into the picture', () => {
    const fades = sceneFades({ x: 0, y: 100, width: 393, height: 524 }, frame);
    expect(fades.map((f) => f.id)).toEqual(['top', 'bottom']);
    expect(fades[0]).toMatchObject({ box: { x: 0, y: 100, width: 393, height: 56 }, from: { x: 0, y: 0 }, to: { x: 0, y: 1 } });
    expect(fades[1]).toMatchObject({ box: { y: 100 + 524 - 56, height: 56 }, from: { x: 0, y: 1 }, to: { x: 0, y: 0 } });
  });
});

describe('the review screen', () => {
  const review = read('screens/liveness/LivenessReview.tsx');
  const picture = read('screens/liveness/ReviewScene.tsx');
  const backdrop = read('screens/liveness/Backdrop.tsx');
  const stills = read('screens/liveness/useSelfieStills.ts');

  it('shows the still the selfie was cut from, under the camera’s light blur, not a heavy one', () => {
    expect(picture).toContain('sceneOnReview(');
    expect(review).toContain('<ReviewScene scene={scene}');
    expect(backdrop).not.toContain('blurRadius');
    // The review's picture goes where the camera went: under the same blur and tint.
    expect(review).toContain('<CameraBackdrop');
  });

  it('keeps the still only when the selfie was cut from it with a known face', () => {
    expect(stills).toMatch(/cut && face && size\s*\?/);
  });

  it('draws the window’s green line in the window’s own shape', () => {
    expect(review).toContain('windowOutline(window, RIM / 2)');
  });
});

describe('the review’s theme', () => {
  it('is the person’s own, not the camera’s forced light: nothing is left to light', () => {
    expect(read('screens/LivenessStep.tsx')).toMatch(/<OwnTheme>\s*<LivenessReview /);
  });
});
