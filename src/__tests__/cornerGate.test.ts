// The four-corner gate between the native reading and the crop. Pure modules
// only: `useCornerGate` and the detector binding pull in React Native.
import { cornersHint, judgeCorners, readCorners, type CornerFields } from '../capture/cornerGate';
import { documentHintIsAction, documentHintText } from '../capture/hints';
import { cornerCropRect, coverVisibleRegion, quadInImage } from '../services/cardCrop';
import type { DocumentQuad } from '../capture/documentCorners';

const CARD: DocumentQuad = {
  topLeft: { x: 0.1, y: 0.3 },
  topRight: { x: 0.9, y: 0.3 },
  bottomRight: { x: 0.9, y: 0.6 },
  bottomLeft: { x: 0.1, y: 0.6 },
};

function reading(q: DocumentQuad | null, frame = { w: 1080, h: 1920 }): CornerFields {
  const z = { x: 0, y: 0 };
  const c = q ?? { topLeft: z, topRight: z, bottomRight: z, bottomLeft: z };
  return {
    found: q !== null,
    topLeftX: c.topLeft.x, topLeftY: c.topLeft.y,
    topRightX: c.topRight.x, topRightY: c.topRight.y,
    bottomRightX: c.bottomRight.x, bottomRightY: c.bottomRight.y,
    bottomLeftX: c.bottomLeft.x, bottomLeftY: c.bottomLeft.y,
    frameWidth: frame.w, frameHeight: frame.h,
  };
}

describe('readCorners', () => {
  it('keeps the gate out of the way when there is no detector', () => {
    expect(readCorners({ ...reading(CARD), unavailable: true })).toEqual({ kind: 'unavailable' });
    expect(readCorners(null)).toEqual({ kind: 'unavailable' });
  });

  it('treats an older native binary (no corner fields) as no detector', () => {
    expect(readCorners({ found: true })).toEqual({ kind: 'unavailable' });
  });

  it('reads nothing found as a measurement, not as no detector', () => {
    expect(readCorners(reading(null))).toEqual({ kind: 'measured', quad: null, frameAspect: 1080 / 1920 });
  });

  it('reads the four corners and the frame aspect', () => {
    const r = readCorners(reading(CARD));
    expect(r).toEqual({ kind: 'measured', quad: CARD, frameAspect: 1080 / 1920 });
  });
});

describe('judgeCorners', () => {
  it('passes a card with space around it in a matching view', () => {
    const r = readCorners(reading(CARD));
    if (r.kind !== 'measured') throw new Error('expected a measurement');
    expect(judgeCorners(r, 1080 / 1920)).toBeNull();
  });

  it('holds a card whose corners the cover-fit preview crops off', () => {
    // A 9:16 frame in an even taller view loses its sides (x 0.14..0.86 shows),
    // so the card's corners at x 0.1 and 0.9 are off screen.
    const r = readCorners(reading(CARD));
    if (r.kind !== 'measured') throw new Error('expected a measurement');
    expect(judgeCorners(r, 0.4)).toBe('corner_cut_off');
  });

  it('asks for the document when nothing was found', () => {
    const r = readCorners(reading(null));
    if (r.kind !== 'measured') throw new Error('expected a measurement');
    expect(judgeCorners(r, 0.75)).toBe('no_document');
  });
});

describe('corner hints', () => {
  it('says what to do, in the shared wording', () => {
    expect(documentHintText(cornersHint('no_document'), 'passport')).toBe('Place your ID inside the frame');
    expect(documentHintText(cornersHint('corner_cut_off'), 'passport')).toBe('Fit all four corners of your ID inside the frame');
    expect(documentHintText(cornersHint('too_close'), 'passport')).toBe('Move back a little so there is space around your ID');
    expect(documentHintIsAction('cornerCutOff')).toBe(true);
  });
});

describe('corner crop geometry', () => {
  it('finds the slice a cover-fit preview shows', () => {
    const v = coverVisibleRegion(9 / 16, 3 / 4); // tall frame in a wider box: top and bottom cut
    expect(v.left).toBe(0);
    expect(v.right).toBe(1);
    expect(v.top).toBeCloseTo(0.125, 6);
    expect(v.bottom).toBeCloseTo(0.875, 6);
    expect(coverVisibleRegion(3 / 4, 3 / 4)).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
  });

  it('leaves a quad alone when the frame and the photo share an aspect', () => {
    expect(quadInImage(CARD, 0.75, 0.75)).toEqual(CARD);
  });

  it('carries a 9:16 frame quad into a 3:4 photo', () => {
    // Both cut from a 3:4 sensor: the 9:16 frame is its full height, 75% of its width.
    const q = quadInImage(CARD, 9 / 16, 3 / 4);
    expect(q.topLeft.x).toBeCloseTo(0.125 + 0.1 * 0.75, 6);
    expect(q.topLeft.y).toBeCloseTo(0.3, 6);
    expect(q.bottomRight.x).toBeCloseTo(0.125 + 0.9 * 0.75, 6);
  });

  it('crops the photo to the corners plus the bleed', () => {
    // 3000×4000 photo, 3:4 frame: x 300..2700 and y 1200..2400, plus 120 / 160 px.
    expect(cornerCropRect(3000, 4000, CARD, 0.75)).toEqual({ originX: 180, originY: 1040, width: 2640, height: 1520 });
  });
});
