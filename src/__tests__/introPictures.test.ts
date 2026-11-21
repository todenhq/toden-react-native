import { readFileSync } from 'fs';
import { join } from 'path';

import { frontShows, scanComingIn, scanFrame, scanLoopSeconds } from '../lib/documentScanTimeline';
import { cubicBezier, passLook, sampledTrack } from '../lib/previewMotion';
import {
  comingIn,
  PREVIEW_GESTURES,
  PREVIEW_REST,
  previewRound,
  roundPass,
  roundPose,
  roundProgress,
} from '../liveness/gesturePreviewTimeline';
import { TOON_PARTS } from '../liveness/toonFace';
import { cameraRoom, mixPrimary, paintToon, toonShades } from '../liveness/toonShades';

// ─── The pictures on the two intro screens ───────────────────────────────────
//
// The liveness intro's cartoon person in a copy of the camera's window
// (screens/liveness/GesturePreview) and the document intro's scan
// (screens/document/DocumentScanPreview). Their loops are pure timelines,
// with the web SDK's numbers.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the gesture preview’s round', () => {
  const round = previewRound(PREVIEW_GESTURES);

  it('turns, nods, blinks and smiles, each for the web’s length', () => {
    expect(round.gestures.map((g) => g.gesture)).toEqual(['turn', 'nod', 'blink', 'smile']);
    // Each starts when the tick before it goes: 0.15 s for the line to close,
    // then 0.8 s of tick.
    expect(round.gestures.map((g) => +g.start.toFixed(2))).toEqual([0, 3.35, 6.3, 8.75]);
  });

  it('pops a tick up after each gesture, and holds the last one longer', () => {
    expect(round.ticks.map(([on, off]) => +(off - on).toFixed(2))).toEqual([0.8, 0.8, 0.8, 1.1]);
    const [on] = round.ticks[0]!;
    expect(roundPass(round, on - 0.01).tickOpacity).toBe(0);
    // Up fast: 160 ms to full size, a little past it on the way.
    const popped = roundPass(round, on + 0.16);
    expect(popped.tickScale).toBeCloseTo(1, 5);
    expect(popped.cover).toBe(1);
    const peak = Math.max(...Array.from({ length: 16 }, (_, i) => roundPass(round, on + i / 100).tickScale));
    expect(peak).toBeGreaterThan(1);
    // Gone again by the time the round ends, so a new one starts clean.
    expect(roundPass(round, round.seconds).tickOpacity).toBe(0);
  });

  it('fills the line one part per gesture, and closes it with the last', () => {
    expect(roundProgress(round, 0)).toBe(0);
    expect(roundProgress(round, 1.2)).toBeCloseTo(0.125, 5);
    expect(roundProgress(round, 3)).toBe(0.25);
    expect(roundProgress(round, 6.1)).toBe(0.5);
    expect(roundProgress(round, round.seconds)).toBe(1);
  });

  it('slides the face both ways in the turn, down then up in the nod, and rests between', () => {
    const across = Array.from({ length: 49 }, (_, i) => roundPose(round, i / 20).across);
    expect(Math.min(...across)).toBeLessThan(-0.95);
    expect(Math.max(...across)).toBeGreaterThan(0.95);
    const downs = Array.from({ length: 41 }, (_, i) => roundPose(round, 3.35 + i / 20).down);
    expect(Math.max(...downs)).toBeGreaterThan(0.95);
    expect(Math.min(...downs)).toBeLessThan(-0.6);
    expect(roundPose(round, 2.9)).toEqual(PREVIEW_REST);
  });

  it('shuts the eyes twice in the blink and smiles in the smile', () => {
    const shut = Array.from({ length: 31 }, (_, i) => roundPose(round, 6.3 + i / 20).shut);
    let blinks = 0;
    for (let i = 1; i < shut.length; i++) if (shut[i] && !shut[i - 1]) blinks++;
    expect(blinks).toBe(2);
    expect(roundPose(round, 8.75 + 0.95).smile).toBe(true);
  });

  it('holds still on a passive check while the line closes over 2.4 s, then the tick', () => {
    const passive = previewRound([]);
    expect(passive.gestures).toEqual([]);
    expect(roundProgress(passive, 1.2)).toBeCloseTo(0.5, 5);
    expect(roundProgress(passive, 2.4)).toBe(1);
    expect(roundPose(passive, 1)).toEqual(PREVIEW_REST);
    expect(roundPass(passive, 2.4 + 0.15 + 0.2).tickOpacity).toBe(1);
  });

  it('comes in once, a touch too close, and settles', () => {
    expect(comingIn(0)).toEqual({ opacity: 0, scale: 0.86 });
    const scales = Array.from({ length: 23 }, (_, i) => comingIn(i * 0.05).scale);
    expect(Math.max(...scales)).toBeCloseTo(1.06, 2);
    expect(comingIn(1.1)).toEqual({ opacity: 1, scale: 1 });
  });
});

describe('the cartoon person', () => {
  it('is painted in shades of the workflow’s colour, as the web mixes them', () => {
    const shades = toonShades('#5645F5');
    // color-mix(in srgb, primary 22%, #fff)
    expect(shades.skin).toBe(mixPrimary('#5645F5', 0.22, '#ffffff'));
    expect(shades.skin).toBe('#dad6fd');
    expect(shades.clothes).toBe('#5645f5');
    expect(shades.light).toBe('#ffffff');
    expect(toonShades('#0DA211').skin).not.toBe(shades.skin);
  });

  it('has no colour of its own left in the drawing', () => {
    const shades = toonShades('#5645F5');
    for (const part of Object.values(TOON_PARTS)) {
      const painted = paintToon(part, shades);
      expect(painted).not.toContain('var(');
    }
  });

  it('cuts the open mouth with a white mask, which reads the same either way', () => {
    const painted = paintToon(TOON_PARTS.mouthSmile, toonShades('#5645F5'));
    const mask = painted.slice(painted.indexOf('<mask'), painted.indexOf('</mask>'));
    expect(mask).toContain('fill:#ffffff');
  });

  it('sits in a dusk that leans to the workflow’s colour', () => {
    const room = cameraRoom('#5645F5');
    expect(room.from).toBe(mixPrimary('#5645F5', 0.28, '#66708a'));
    expect(room.to).toBe(mixPrimary('#5645F5', 0.22, '#3b4257'));
  });

  it('carries its credit, in the source and the README', () => {
    expect(read('liveness/toonFace.ts')).toContain('"Toon Head" by Johan Melin');
    expect(read('liveness/toonFace.ts')).toContain('CC BY 4.0');
    expect(read('../README.md')).toMatch(/## Credits[\s\S]*"Toon Head" by \[Johan Melin\]/);
  });

  it('is a picture, hidden from screen readers', () => {
    for (const file of ['screens/liveness/GesturePreview.tsx', 'screens/document/DocumentScanPreview.tsx']) {
      expect(read(file)).toContain('importantForAccessibility="no-hide-descendants"');
    }
  });
});

describe('the document scan’s loop', () => {
  it('reads a one-sided document, ticks, and rests before reading it again', () => {
    expect(scanLoopSeconds(false)).toBeCloseTo(3.15, 5);
    expect(scanFrame(false, 0.8).bandOpacity).toBe(1);
    expect(scanFrame(false, 0.8).bandAt).toBeCloseTo(0.5, 5);
    expect(scanFrame(false, 2).bandOpacity).toBe(0);
    expect(scanFrame(false, 2).pass.cover).toBe(1);
    expect(scanFrame(false, 2.9).pass.tickOpacity).toBe(0);
    // A passport page never turns.
    for (let at = 0; at < 3.15; at += 0.05) expect(scanFrame(false, at).angle).toBe(0);
  });

  it('turns a two-sided document over, reads its back, and turns it back', () => {
    expect(scanLoopSeconds(true)).toBeCloseTo(6.8, 5);
    expect(frontShows(scanFrame(true, 1).angle)).toBe(true);
    // The turn: 1.6 s of reading, 0.8 s of tick, a 0.25 s beat, 0.75 s of turning.
    const half = scanFrame(true, 2.65 + 0.375);
    expect(half.angle).toBeCloseTo(90, 5);
    expect(half.lift).toBeCloseTo(1, 5);
    expect(half.glintOpacity).toBeCloseTo(0.9, 5);
    expect(frontShows(scanFrame(true, 4).angle)).toBe(false);
    expect(scanFrame(true, 4).bandOpacity).toBe(1);
    expect(scanFrame(true, 5.2).pass.cover).toBe(1);
    expect(scanFrame(true, 6.8 - 1e-9).angle).toBeCloseTo(360, 3);
    expect(frontShows(scanFrame(true, 6.8 - 1e-9).angle)).toBe(true);
  });

  it('catches the light only as it turns', () => {
    expect(scanFrame(true, 1).glintOpacity).toBe(0);
    expect(scanFrame(true, 4).glintOpacity).toBe(0);
  });

  it('comes in once with a fade and a small settle', () => {
    expect(scanComingIn(0)).toEqual({ opacity: 0, scale: 0.94 });
    expect(scanComingIn(0.5)).toEqual({ opacity: 1, scale: 1 });
  });

  it('takes the room it has, between 180 and 340 wide, with the marks clear of it', () => {
    const preview = read('screens/document/DocumentScanPreview.tsx');
    expect(preview).toContain('const MIN_WIDTH = 180;');
    expect(preview).toContain('const MAX_WIDTH = 340;');
    expect(preview).toContain('const ROOM_X = 20;');
    expect(preview).toContain('const ROOM_Y = 22;');
    expect(preview).toContain('borderColor: `${colors.primary}B3`');
  });
});

describe('the motion both pictures share', () => {
  it('pops past full size and settles, as the web’s cubic-bezier(0.34, 1.56, 0.64, 1)', () => {
    const pop = cubicBezier(0.34, 1.56, 0.64, 1);
    expect(pop(0)).toBe(0);
    expect(pop(1)).toBe(1);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => pop(i / 100)))).toBeGreaterThan(1.05);
  });

  it('shows nothing before the first step has worked', () => {
    expect(passLook([[1, 2]], 0.5)).toEqual({ cover: 0, tickOpacity: 0, tickScale: 0.4 });
  });

  it('samples a timeline end to end for the native driver', () => {
    const track = sampledTrack(1, (at) => at * 2);
    expect(track.inputRange[0]).toBe(0);
    expect(track.inputRange[track.inputRange.length - 1]).toBe(1);
    expect(track.outputRange[track.outputRange.length - 1]).toBe(2);
    expect(track.inputRange).toHaveLength(61);
  });
});
