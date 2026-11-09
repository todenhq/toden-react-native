import { judgeCorners } from '../capture/cornerGate';
import { guideFractions, guideRect, immersiveBand } from '../capture/documentTurn';
import type { DocumentQuad, Point } from '../capture/documentCorners';
import { coverVisibleRegion } from '../services/cardCrop';

// The corner gate on an Android phone, in the phone's own geometry: a Galaxy
// S24 held upright (a 360 x 780 dp screen, 1080 x 2340 px), the back camera's
// sensor mounted landscape (rotation 90, or 270 on some phones), and the
// preview cover-fitted to the screen. Android hands the frame over in the
// SENSOR's orientation; the native detector turns it upright before it reports
// corners (DocumentLuma.kt), so these tests carry sensor points through the same
// turn and then judge them in the part of the upright frame the screen shows.

const VIEW = { width: 360, height: 780 };
const VIEW_AR = VIEW.width / VIEW.height;

/** The detector's turn: a sensor pixel to the normalised upright frame (DocumentLuma.kt). */
function sensorToUpright(p: Point, sensor: { width: number; height: number }, rotation: 90 | 270): Point {
  // Clockwise by `rotation`: upright is sensor.height wide and sensor.width tall.
  return rotation === 90
    ? { x: (sensor.height - p.y) / sensor.height, y: p.x / sensor.width }
    : { x: p.y / sensor.height, y: (sensor.width - p.x) / sensor.width };
}

/** The upright document's corners, found in a sensor frame turned by `rotation`. */
function measured(upright: { l: number; t: number; r: number; b: number }, sensor: { width: number; height: number }, rotation: 90 | 270) {
  // Place the document in the sensor frame where the camera would see it,
  // then let the detector's turn bring it back upright.
  const toSensor = (u: Point): Point =>
    rotation === 90
      ? { x: u.y * sensor.width, y: sensor.height - u.x * sensor.height }
      : { x: sensor.width - u.y * sensor.width, y: u.x * sensor.height };
  const corners = [
    { x: upright.l, y: upright.t },
    { x: upright.r, y: upright.t },
    { x: upright.r, y: upright.b },
    { x: upright.l, y: upright.b },
  ].map((u) => sensorToUpright(toSensor(u), sensor, rotation));
  // The turn keeps the corners in order round the document; the detector
  // reports its axis-aligned box, so take the box back.
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const [l, r, t, b] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const quad: DocumentQuad = {
    topLeft: { x: l, y: t }, topRight: { x: r, y: t }, bottomRight: { x: r, y: b }, bottomLeft: { x: l, y: b },
  };
  return { kind: 'measured' as const, quad, frameAspect: sensor.height / sensor.width };
}

const SENSOR_16_9 = { width: 1280, height: 720 };
const SENSOR_4_3 = { width: 1280, height: 960 };

// The upright NIN slip's guide as drawn on the S24, under its status bar and
// above its gesture bar.
const slipGuide = guideFractions(
  guideRect(VIEW.width, VIEW.height, 1 / 2.07, immersiveBand(40, 24)),
  VIEW.width,
  VIEW.height,
);

describe('the turn from the sensor frame to the upright frame', () => {
  it.each([90, 270] as const)('puts a sensor point where the upright frame shows it (rotation %i)', (rotation) => {
    // The sensor's top-left corner is the upright frame's top-right at 90 and
    // its bottom-left at 270, and the centre stays the centre.
    const s = SENSOR_16_9;
    expect(sensorToUpright({ x: 0, y: 0 }, s, rotation)).toEqual(rotation === 90 ? { x: 1, y: 0 } : { x: 0, y: 1 });
    expect(sensorToUpright({ x: s.width / 2, y: s.height / 2 }, s, rotation)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('the corners are judged in the part of the frame the screen shows', () => {
  it('a 16:9 frame shows its middle 82% across on an upright S24', () => {
    const v = coverVisibleRegion(720 / 1280, VIEW_AR);
    expect(v.left).toBeCloseTo(0.0897, 3);
    expect(v.right).toBeCloseTo(0.9103, 3);
    expect([v.top, v.bottom]).toEqual([0, 1]);
  });

  it('a 4:3 frame shows its middle 62% across', () => {
    const v = coverVisibleRegion(960 / 1280, VIEW_AR);
    expect(v.right - v.left).toBeCloseTo(0.615, 3);
  });

  describe.each([
    ['16:9', SENSOR_16_9],
    ['4:3', SENSOR_4_3],
  ] as const)('a %s sensor', (_name, sensor) => {
    const visible = coverVisibleRegion(sensor.height / sensor.width, VIEW_AR);
    // A slip sitting in the drawn guide, in upright frame shares.
    const inGuide = {
      l: visible.left + slipGuide.x * (visible.right - visible.left),
      r: visible.left + (slipGuide.x + slipGuide.width) * (visible.right - visible.left),
      t: slipGuide.y,
      b: slipGuide.y + slipGuide.height,
    };

    it.each([90, 270] as const)('passes a slip in the guide (rotation %i)', (rotation) => {
      expect(judgeCorners(measured(inGuide, sensor, rotation), VIEW_AR, slipGuide)).toBeNull();
    });

    it.each([90, 270] as const)('refuses a slip whose right side is off the screen though still in the frame (rotation %i)', (rotation) => {
      // Slid right until its right edge sits between the screen's edge and the frame's.
      const shift = visible.right + (1 - visible.right) / 2 - inGuide.r;
      const offScreen = { ...inGuide, l: inGuide.l + shift, r: inGuide.r + shift };
      expect(offScreen.r).toBeLessThan(1);
      expect(judgeCorners(measured(offScreen, sensor, rotation), VIEW_AR, slipGuide)).toBe('corner_cut_off');
    });

    it.each([90, 270] as const)('refuses a slip whose bottom runs to the edge of the screen (rotation %i)', (rotation) => {
      const low = { ...inGuide, t: inGuide.t + 0.2, b: 0.999 };
      expect(judgeCorners(measured(low, sensor, rotation), VIEW_AR, slipGuide)).toBe('corner_cut_off');
    });

    it.each([90, 270] as const)('calls a box far bigger than the guide too close, in the same space (rotation %i)', (rotation) => {
      // In view with space round it, but 1.2 times the guide's height: the
      // slip itself runs off the picture and this is a box printed on it.
      const cy = (inGuide.t + inGuide.b) / 2;
      const hh = ((inGuide.b - inGuide.t) / 2) * 1.2;
      const big = { ...inGuide, t: cy - hh, b: cy + hh };
      expect(judgeCorners(measured(big, sensor, rotation), VIEW_AR)).toBeNull();
      expect(judgeCorners(measured(big, sensor, rotation), VIEW_AR, slipGuide)).toBe('too_close');
    });
  });
});

describe('a frame turned the other way from the preview', () => {
  it('holds capture: its corners are in a space the user is not looking at', () => {
    // Android used to turn the frame stream by the accelerometer: a phone tipped
    // sideways streamed a landscape frame under the portrait preview. The
    // corners below are in view of THAT frame, which says nothing about the screen.
    const r = {
      kind: 'measured' as const,
      quad: { topLeft: { x: 0.4, y: 0.2 }, topRight: { x: 0.6, y: 0.2 }, bottomRight: { x: 0.6, y: 0.8 }, bottomLeft: { x: 0.4, y: 0.8 } },
      frameAspect: 1280 / 720,
    };
    expect(judgeCorners(r, VIEW_AR, slipGuide)).toBe('no_document');
    expect(judgeCorners(r, VIEW_AR)).toBe('no_document');
  });

  it('changes nothing when the frame and the preview agree', () => {
    const r = {
      kind: 'measured' as const,
      quad: { topLeft: { x: 0.3, y: 0.3 }, topRight: { x: 0.7, y: 0.3 }, bottomRight: { x: 0.7, y: 0.5 }, bottomLeft: { x: 0.3, y: 0.5 } },
      frameAspect: 720 / 1280,
    };
    expect(judgeCorners(r, VIEW_AR)).toBeNull();
  });
});
