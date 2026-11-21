import { readFileSync } from 'fs';
import { join } from 'path';

import { mergeWorkflowConfig, overlayApplicantWorkflow, WORKFLOW_KEYS } from '../config/workflowMerge';
import { FACE_INSET, headShape, NARRATOR_STROKE, narratorPaths } from '../liveness/narratorGlyph';
import {
  gestureGuideEnabled,
  NARRATOR_REST,
  NARRATOR_SECONDS,
  narratedGesture,
  narratorPose,
  narratorStillPose,
  type NarratorGesture,
} from '../liveness/narratorPose';

// ─── The gesture narrator ────────────────────────────────────────────────────
//
// The face icon that pops up in the liveness window and acts out the gesture
// once. The pose cases are the web SDK's own (liveness/narrator-pose.test.ts).

const GESTURES: NarratorGesture[] = ['turn', 'nod', 'blink', 'smile'];
const DIRECTIONS: NarratorGesture[] = ['turnLeft', 'turnRight', 'lookUp', 'lookDown'];
const ALL: NarratorGesture[] = [...GESTURES, ...DIRECTIONS];
const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

/** The pose at every 20th of a second through one pass. */
function pass(gesture: NarratorGesture) {
  const steps = Math.round(NARRATOR_SECONDS[gesture] * 20);
  return Array.from({ length: steps + 1 }, (_, i) => narratorPose(gesture, (i / steps) * NARRATOR_SECONDS[gesture]));
}

describe('the narrator’s poses', () => {
  it.each(ALL)('%s starts and ends at rest, so it arrives and leaves facing the person', (gesture) => {
    const poses = pass(gesture);
    for (const pose of [poses[0]!, poses[poses.length - 1]!]) {
      expect(pose.across).toBeCloseTo(NARRATOR_REST.across, 3);
      expect(pose.down).toBeCloseTo(NARRATOR_REST.down, 3);
      expect(pose.eyes).toBeCloseTo(NARRATOR_REST.eyes, 3);
      expect(pose.smile).toBeCloseTo(NARRATOR_REST.smile, 3);
      expect(pose.lookX).toBeCloseTo(0, 3);
      expect(pose.lookY).toBeCloseTo(0, 3);
    }
  });

  it.each([
    ['turnLeft', 'across', -1],
    ['turnRight', 'across', 1],
    ['lookUp', 'down', -1],
    ['lookDown', 'down', 1],
  ] as const)('%s goes one way only, all the way, and holds there', (gesture, axis, way) => {
    const values = pass(gesture).map((p) => p[axis] * way);
    expect(Math.max(...values)).toBeGreaterThan(0.95);
    expect(Math.min(...values)).toBeGreaterThan(-0.01);
    // Held at the far end for a moment: more than a tenth of the pass.
    expect(values.filter((v) => v > 0.95).length).toBeGreaterThan(values.length / 10);
  });

  it('turns left toward the left of the screen, as the mirrored camera shows the person’s left', () => {
    expect(narratorStillPose('turnLeft').across).toBe(-1);
    expect(narratorStillPose('turnRight').across).toBe(1);
  });

  it('looks where the head is about to go, a moment before it gets there', () => {
    const poses = pass('turnRight');
    const firstLook = poses.findIndex((p) => p.lookX > 0.2);
    const firstTurn = poses.findIndex((p) => p.across > 0.2);
    expect(firstLook).toBeGreaterThan(-1);
    expect(firstLook).toBeLessThanOrEqual(firstTurn);
  });

  it('turns fully to one side and then the other', () => {
    const across = pass('turn').map((p) => p.across);
    expect(Math.min(...across)).toBeLessThan(-0.95);
    expect(Math.max(...across)).toBeGreaterThan(0.95);
    expect(across.findIndex((a) => a < -0.95)).toBeLessThan(across.findIndex((a) => a > 0.95));
  });

  it('nods down, then up past the middle', () => {
    const down = pass('nod').map((p) => p.down);
    expect(Math.max(...down)).toBeGreaterThan(0.95);
    expect(Math.min(...down)).toBeLessThan(-0.6);
  });

  it('blinks twice, the eyes fully shut each time', () => {
    const eyes = pass('blink').map((p) => p.eyes);
    let blinks = 0;
    for (let i = 1; i < eyes.length; i++) if (eyes[i]! < 0.1 && eyes[i - 1]! >= 0.1) blinks++;
    expect(blinks).toBe(2);
    expect(Math.min(...eyes)).toBeLessThan(0.05);
  });

  it('smiles in full, with the eyes narrowing and the chin lifting a little, and no more than a drift across', () => {
    const poses = pass('smile');
    expect(Math.max(...poses.map((p) => p.smile))).toBeGreaterThan(0.95);
    expect(Math.min(...poses.map((p) => p.eyes))).toBeLessThan(0.75);
    expect(Math.min(...poses.map((p) => p.down))).toBeCloseTo(-0.12, 2);
    expect(poses.every((p) => Math.abs(p.across) <= 0.05)).toBe(true);
  });

  it.each(ALL)('with less motion, %s holds one pose that says it', (gesture) => {
    expect(narratorStillPose(gesture)).not.toEqual(NARRATOR_REST);
  });
});

describe('the narrator’s drawing', () => {
  /** Every point of a path, as [x, y]. */
  const points = (d: string): [number, number][] => {
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    return Array.from({ length: nums.length / 2 }, (_, i) => [nums[i * 2]!, nums[i * 2 + 1]!]);
  };

  it('at rest is the web’s icon: a round head, open eyes, the nose and a flat mouth, no lids', () => {
    const rest = narratorPaths(NARRATOR_REST);
    // The web's ellipse at 50, 50, radius 44.
    expect(rest.head).toBe('M6 50A44 44 0 1 0 94 50A44 44 0 1 0 6 50Z');
    // The features scaled 1.15 about (50, 54) and centred on the head.
    expect(rest.eyes).toEqual(['M35.05 28.73L35.05 39.08', 'M64.95 28.73L64.95 39.08']);
    expect(rest.nose).toBe('M50 30.45L50 50Q50 54.6 44.83 54.6');
    expect(rest.mouth).toBe('M35.05 66.1Q50 73 64.95 66.1');
    expect(rest.lidOpacity).toBe(0);
  });

  it('turns the head with the face: it narrows and leans the way it goes', () => {
    expect(narratorPaths({ ...NARRATOR_REST, across: 1 }).head).toBe('M13.4 50A39.6 44 0 1 0 92.6 50A39.6 44 0 1 0 13.4 50Z');
    expect(headShape({ ...NARRATOR_REST, down: -1 })).toEqual({ cx: 50, cy: 47.5, rx: 44, ry: 41.36 });
  });

  it('slides and draws the features together in a turn, the nose furthest', () => {
    const rest = narratorPaths(NARRATOR_REST);
    const turned = narratorPaths({ ...NARRATOR_REST, across: 1 });
    const eyeShift = points(turned.eyes[0])[0]![0] - points(rest.eyes[0])[0]![0];
    const noseShift = points(turned.nose)[0]![0] - points(rest.nose)[0]![0];
    expect(eyeShift).toBeGreaterThan(0);
    expect(noseShift).toBeGreaterThan(eyeShift);
  });

  it('moves the eyes in their look', () => {
    const rest = points(narratorPaths(NARRATOR_REST).eyes[0]);
    const looking = points(narratorPaths({ ...NARRATOR_REST, lookX: 1, lookY: 1 }).eyes[0]);
    expect(looking[0]![0]).toBeGreaterThan(rest[0]![0]);
    expect(looking[0]![1]).toBeGreaterThan(rest[0]![1]);
  });

  it('shows the lids only as the eyes close', () => {
    expect(narratorPaths({ ...NARRATOR_REST, eyes: 0 }).lidOpacity).toBe(1);
    expect(narratorPaths({ ...NARRATOR_REST, eyes: 0.5 }).lidOpacity).toBe(0);
  });

  it('curves the mouth up in a smile', () => {
    const flat = points(narratorPaths(NARRATOR_REST).mouth);
    const smiling = points(narratorPaths({ ...NARRATOR_REST, smile: 1 }).mouth);
    // The corners rise and the middle drops: a curve up.
    expect(smiling[0]![1]).toBeLessThan(flat[0]![1]);
    expect(smiling[1]![1]).toBeGreaterThan(flat[1]![1]);
  });

  it.each(ALL)('keeps the features inside the head all through %s, so no clip is needed', (gesture) => {
    for (const pose of [...pass(gesture), narratorStillPose(gesture)]) {
      const paths = narratorPaths(pose);
      // Inside the web's clip, by half a line as well, so not even a line's end reaches it.
      const h = headShape(pose, FACE_INSET + NARRATOR_STROKE / 2);
      for (const d of [...paths.eyes, ...paths.lids, paths.nose, paths.mouth]) {
        for (const [x, y] of points(d)) {
          expect(((x - h.cx) / h.rx) ** 2 + ((y - h.cy) / h.ry) ** 2).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('when the narrator acts', () => {
  const asked = { enabled: true, phase: 'challenge' as const, movingIntoPlace: false };

  it.each(ALL)('acts out %s while it is asked for', (gesture) => {
    expect(narratedGesture({ ...asked, challenge: gesture })).toBe(gesture);
  });

  it('has nothing to act for the hold, the flash, the tick or a failure', () => {
    expect(narratedGesture({ ...asked, challenge: 'hold' })).toBeNull();
    expect(narratedGesture({ ...asked, challenge: null })).toBeNull();
    for (const phase of ['positioning', 'challenge_passed', 'flash', 'capturing', 'complete', 'failed'] as const) {
      expect(narratedGesture({ ...asked, phase, challenge: 'nod' })).toBeNull();
    }
  });

  it('keeps out of the way while the person is asked to move into place', () => {
    expect(narratedGesture({ ...asked, challenge: 'turn', movingIntoPlace: true })).toBeNull();
  });

  it('is off when the workflow turns it off', () => {
    expect(narratedGesture({ ...asked, enabled: false, challenge: 'smile' })).toBeNull();
  });
});

describe('the livenessGestureGuide switch', () => {
  it('is on unless a workflow or the host says false', () => {
    expect(gestureGuideEnabled({})).toBe(true);
    expect(gestureGuideEnabled({ livenessGestureGuide: null })).toBe(true);
    expect(gestureGuideEnabled({ livenessGestureGuide: true })).toBe(true);
    expect(gestureGuideEnabled({ livenessGestureGuide: false })).toBe(false);
  });

  it('rides the workflow keys and the applicant leg', () => {
    expect(WORKFLOW_KEYS as readonly string[]).toContain('livenessGestureGuide');
    expect(mergeWorkflowConfig({ livenessGestureGuide: false }, { livenessGestureGuide: true }).livenessGestureGuide).toBe(
      false,
    );
    const out = overlayApplicantWorkflow(
      { id: 'wf_applicant', config: { livenessGestureGuide: false } },
      { livenessGestureGuide: true } as Record<string, unknown>,
    );
    expect(out.livenessGestureGuide).toBe(false);
  });

  it('is what the liveness step reads', () => {
    expect(read('screens/LivenessStep.tsx')).toContain('enabled: gestureGuideEnabled(config),');
  });
});

describe('the narrator on screen', () => {
  const narrator = read('screens/liveness/GestureNarrator.tsx');

  it('is drawn in solid white, the colour of the line round the window, in flat lines', () => {
    expect(narrator).toContain("export const NARRATOR_COLOUR = '#ffffff';");
    expect(narrator).toContain('stroke: NARRATOR_COLOUR,');
    expect(narrator).not.toContain('colors.primary');
    expect(narrator).not.toMatch(/shadow(Color|Opacity|Radius|Offset)|elevation:/);
  });

  it('shows the way again at once when the person goes the wrong way', () => {
    expect(narrator).toMatch(/if \(showAgain === shownFor\.current\) return;[\s\S]*if \(gesture\) setTurn\('showing'\);/);
    expect(read('screens/liveness/LivenessLive.tsx')).toContain('showAgain={liveness.wrongWayCount}');
  });

  it('is a picture: screen readers are given the words instead', () => {
    expect(narrator).toContain('accessibilityElementsHidden');
    expect(narrator).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it('comes back only after five quiet seconds, never on a plain timer', () => {
    expect(narrator).toContain('const PATIENCE_MS = 5000;');
    expect(narrator).toContain('Math.max(left, respondedAtRef.current)');
  });

  it('stands inside the window, clipped by it, and is not there on a failure', () => {
    const live = read('screens/liveness/LivenessLive.tsx');
    expect(live).toMatch(/<LivenessWindow[\s\S]*<GestureNarrator[\s\S]*<\/LivenessWindow>/);
    expect(live).toContain('gesture={failure ? null : narratedGesture}');
  });

  it('is fed by the response watch in the frame loop', () => {
    const hook = read('liveness/useLiveness.ts');
    expect(hook).toContain('responseWatchRef.current.seen(data, Date.now());');
    expect(hook).toContain('respondedAtRef.current = responseWatchRef.current.respondedAt;');
  });
});
