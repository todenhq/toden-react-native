import { readFileSync } from 'fs';
import { join } from 'path';

import { LIVENESS_TINT } from '../lib/livenessCutout';
import { ATTENTION, LIT_STROKE_EXTRA, PULSE_GROW, PULSE_MS, ringClosed, SIDE_OF, sideStates, WAITING, SHADOW_LAYERS } from '../lib/sideRing';
import { SEGMENT_GAP, sideSegments, WINDOW_SIDES } from '../lib/windowSegments';

// ─── The four-sided line round the window, for head directions ──────────────
//
// The web SDK's steps/liveness/SideRing.test.tsx and the window's ring
// numbers (WindowRing.tsx, liveness-cutout.ts), as far as they can be read
// without a screen.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the sides', () => {
  it('is the side the head goes to: left and right are the person’s own, which the mirrored picture shows as the screen’s', () => {
    expect(SIDE_OF).toEqual({ turnLeft: 'left', turnRight: 'right', lookUp: 'top', lookDown: 'bottom' });
  });

  it('lights the side asked for and leaves the rest', () => {
    expect(sideStates('turnLeft', [])).toEqual({ top: 'idle', right: 'idle', bottom: 'idle', left: 'asked' });
  });

  it('keeps a side green once it is done, whatever is asked next', () => {
    expect(sideStates('lookUp', ['turnLeft'])).toEqual({ top: 'asked', right: 'idle', bottom: 'idle', left: 'done' });
    expect(sideStates(null, ['turnLeft', 'lookUp'])).toEqual({ top: 'done', right: 'idle', bottom: 'idle', left: 'done' });
    expect(sideStates('turnLeft', ['turnLeft']).left).toBe('done');
  });

  it('closes when the run’s directions are done, not waiting for a side never asked for', () => {
    expect(ringClosed(['turnLeft', 'lookUp', 'lookDown'], ['turnLeft', 'lookUp'])).toBe(false);
    expect(ringClosed(['turnLeft', 'lookUp', 'lookDown'], ['turnLeft', 'lookUp', 'lookDown'])).toBe(true);
    expect(ringClosed(['turnLeft', 'turnRight'], ['turnRight', 'turnLeft'])).toBe(true);
    expect(ringClosed([], [])).toBe(false);
  });

  it('draws the asked side amber at 10 against 6, a waiting side white at 70%, never the workflow’s colour', () => {
    expect(ATTENTION).toBe('#ffb020');
    expect(WAITING).toBe('rgba(255, 255, 255, 0.7)');
    expect(6 + LIT_STROKE_EXTRA).toBe(10);
    const ring = read('screens/liveness/SideRing.tsx');
    expect(ring).not.toContain('colors.primary');
    expect(ring).toContain('outputRange: [waiting, ATTENTION, green]');
    expect(ring).toContain('const waiting = warning ? colors.error : WAITING;');
  });

  it('has no marks on the line, its shadow drawn under it, and one pulse as it closes', () => {
    const ring = read('screens/liveness/SideRing.tsx');
    // Per side: its shadow layers and its line; the closed ring: its shadow
    // layers and its line; the pulse. No circles, no marks.
    expect(ring).not.toMatch(/<Circle|<Polyline|<Line\b/);
    expect(ring.match(/<(Animated)?Path\b/g)).toHaveLength(5);
    expect(ring).not.toContain('shadowColor');
    expect(PULSE_GROW).toBe(1.07);
    expect(PULSE_MS).toBe(850);
    expect(ring).toContain('accessibilityElementsHidden');
  });
});

describe('sideSegments', () => {
  const window = { width: 280, height: 370 };

  it('centres each part on its side, so each is its mirror image about the middle', () => {
    const sides = sideSegments(window, -10);
    const ends = (d: string) => {
      const nums = d.match(/-?\d+\.\d+/g)!.map(Number);
      return { sx: nums[0]!, sy: nums[1]!, ex: nums[nums.length - 2]!, ey: nums[nums.length - 1]! };
    };
    const top = ends(sides.top);
    expect(top.sx + top.ex).toBeCloseTo(window.width, 1);
    expect(top.sy).toBeCloseTo(top.ey, 1);
    const bottom = ends(sides.bottom);
    expect(bottom.sx + bottom.ex).toBeCloseTo(window.width, 1);
    const right = ends(sides.right);
    const left = ends(sides.left);
    expect(right.sx).toBeGreaterThan(window.width / 2);
    expect(left.sx).toBeLessThan(window.width / 2);
  });

  it('draws the top across twelve o’clock as one line', () => {
    const { top } = sideSegments(window, 0);
    expect(top.startsWith('M')).toBe(true);
    expect(top.match(/M/g)).toHaveLength(1);
  });

  it('has one part per side', () => {
    expect(Object.keys(sideSegments(window, 0)).sort()).toEqual([...WINDOW_SIDES].sort());
  });
});

describe('the line round the window', () => {
  it('sits outside the window, 7 clear of it, 6 wide, with a 12 gap between parts', () => {
    const ring = read('screens/liveness/WindowRing.tsx');
    expect(ring).toContain('export const RING_STROKE = 6;');
    expect(ring).toContain('export const RING_GAP = 7;');
    expect(ring).toContain('export const RING_INSET = -(RING_GAP + STROKE / 2);');
    expect(ring).toContain("style={{ position: 'absolute', top: -RING_REACH, left: -RING_REACH }}");
    expect(SEGMENT_GAP).toBe(12);
  });

  it('is the four sides with head directions, and the stages otherwise', () => {
    const window = read('screens/liveness/LivenessWindow.tsx');
    expect(window).toMatch(/\{loading \? null : sides \? \(\s*<SideRing/);
    expect(window).toContain("asked={phase === 'challenge' ? sides.asked : null}");
    expect(read('screens/liveness/LivenessLive.tsx')).toContain('sides={liveness.directionSides}');
  });

  it('shows the tick in the window after every gesture, a direction included', () => {
    expect(read('screens/liveness/LivenessWindow.tsx')).toMatch(/\{phase === 'challenge_passed' \? \(/);
  });

  it('keeps the step count for screen readers only with head directions', () => {
    expect(read('screens/liveness/LivenessLive.tsx')).toContain('visuallyHidden={!!liveness.directionSides}');
    const surfaces = read('screens/liveness/ImmersiveSurfaces.tsx');
    expect(surfaces).toMatch(/if \(visuallyHidden\) \{[\s\S]*accessibilityLabel=\{`Step \$\{step\} of \$\{total\}`\}/);
  });
});

describe('the camera round the window', () => {
  it('lies under the web’s light tint', () => {
    expect(LIVENESS_TINT).toBe(0.08);
  });
});

describe('the shadow under the four-sided line', () => {
  const component = require('fs').readFileSync(require('path').join(__dirname, '../screens/liveness/SideRing.tsx'), 'utf8') as string;

  it('is drawn in the SVG, two layers as the web\'s two shadows, so Android shows it too', () => {
    expect(SHADOW_LAYERS).toEqual([
      { extra: 6, colour: 'rgba(0, 0, 0, 0.12)', dy: 1 },
      { extra: 2, colour: 'rgba(0, 0, 0, 0.28)', dy: 0 },
    ]);
    // Under each side, following its width, and under the closed ring.
    expect(component.match(/\{SHADOW_LAYERS\.map\(\(layer\)/g)).toHaveLength(2);
    expect(component).toContain('strokeWidth={widthPlus(layer.extra)}');
  });

  it('no longer relies on a view shadow, which Android cannot cast from a see-through line', () => {
    expect(component).not.toContain('shadowColor');
    expect(component).not.toContain('elevation');
  });
});

describe('the drawing box round the four-sided line', () => {
  const component = read('screens/liveness/SideRing.tsx');

  it('reaches past the thickest side and its shadow, which an SVG would otherwise cut off', () => {
    // Centre 10 out (7 gap + half the 6 line), then half of 10 + the widest
    // shadow's 6, the shadow's 1 drop and 1 to spare: 20, against the
    // window ring's 13 that cut the asked side at 15 and its shadow at 18.
    const centre = 7 + 6 / 2;
    const outer = centre + (6 + LIT_STROKE_EXTRA + Math.max(...SHADOW_LAYERS.map((l) => l.extra))) / 2 + 1;
    expect(outer).toBe(19);
    expect(component).toContain('const width = window.width + SIDE_REACH * 2;');
    expect(component).toContain('left: -SIDE_REACH, top: -SIDE_REACH');
    expect(component).not.toMatch(/\bRING_REACH \*/);
  });
});

