import { documentCropGuide } from '../capture/documentTurn';
import { CARD_GUIDE_ASPECT, NIN_SLIP_GUIDE_ASPECT } from '../config/idTypes';
import { CROP_STAGE_INSET, clampCropRect, containRect, initialCropRect, insetContainRect, quarterTurnScale, turnedSize } from '../lib/documentCropGeometry';

// The photo cropper on a phone held upright (components/DocumentCropper.tsx):
// its stage is the screen less the top bar, the help line and the bottom bar.
const STAGE = { w: 393, h: 640 };

describe('the crop box for a NIN slip on a phone', () => {
  const guide = documentCropGuide(NIN_SLIP_GUIDE_ASPECT, STAGE.w / STAGE.h);

  it('stands upright, at the inverse of the slip', () => {
    expect(guide.turned).toBe(true);
    expect(guide.aspect).toBeCloseTo(1 / NIN_SLIP_GUIDE_ASPECT);
  });

  it('starts upright on a tall photo: 85% wide, capped at 90% high', () => {
    const img = containRect(3024, 4032, STAGE.w, STAGE.h);
    const box = initialCropRect(img, guide.aspect);
    expect(box.h).toBeGreaterThan(box.w);
    expect(box.w / box.h).toBeCloseTo(1 / NIN_SLIP_GUIDE_ASPECT);
    expect(box.h).toBeCloseTo(img.h * 0.9);
    expect(box.x).toBeGreaterThanOrEqual(img.x);
    expect(box.x + box.w).toBeLessThanOrEqual(img.x + img.w);
  });

  it('a card keeps a landscape box', () => {
    const card = documentCropGuide(CARD_GUIDE_ASPECT, STAGE.w / STAGE.h);
    const box = initialCropRect(containRect(3024, 4032, STAGE.w, STAGE.h), card.aspect);
    expect(box.w / box.h).toBeCloseTo(CARD_GUIDE_ASPECT);
  });
});

describe('Rotate', () => {
  it('swaps the photo\'s sides on each odd turn', () => {
    expect(turnedSize({ w: 4032, h: 3024 }, 0)).toEqual({ w: 4032, h: 3024 });
    expect(turnedSize({ w: 4032, h: 3024 }, 1)).toEqual({ w: 3024, h: 4032 });
    expect(turnedSize({ w: 4032, h: 3024 }, 2)).toEqual({ w: 4032, h: 3024 });
    expect(turnedSize({ w: 4032, h: 3024 }, 3)).toEqual({ w: 3024, h: 4032 });
  });

  it('a sideways scan of a slip, turned once, fills more of the upright box', () => {
    const aspect = 1 / NIN_SLIP_GUIDE_ASPECT;
    const sideways = initialCropRect(containRect(2070, 1000, STAGE.w, STAGE.h), aspect);
    const t = turnedSize({ w: 2070, h: 1000 }, 1);
    const stood = initialCropRect(containRect(t.w, t.h, STAGE.w, STAGE.h), aspect);
    expect(stood.h).toBeGreaterThan(sideways.h * 2);
    // Refitted at the same aspect, inside the turned photo.
    expect(stood.w / stood.h).toBeCloseTo(aspect);
    const img = containRect(t.w, t.h, STAGE.w, STAGE.h);
    expect(clampCropRect(stood, img, aspect)).toEqual(stood);
  });
});

describe('the photo on the stage', () => {
  it('sits at least 16 inside every edge, so a handle never meets the screen edge', () => {
    for (const [w, h] of [[3024, 4032], [4032, 3024], [2070, 1000], [1000, 4000]] as const) {
      const img = insetContainRect(w, h, STAGE.w, STAGE.h);
      expect(img.x).toBeGreaterThanOrEqual(CROP_STAGE_INSET - 1e-9);
      expect(img.y).toBeGreaterThanOrEqual(CROP_STAGE_INSET - 1e-9);
      expect(STAGE.w - (img.x + img.w)).toBeGreaterThanOrEqual(CROP_STAGE_INSET - 1e-9);
      expect(STAGE.h - (img.y + img.h)).toBeGreaterThanOrEqual(CROP_STAGE_INSET - 1e-9);
      expect(img.w / img.h).toBeCloseTo(w / h);
    }
  });

  it('touches the inset on its limiting side, centred on the other', () => {
    const img = insetContainRect(4032, 3024, STAGE.w, STAGE.h);
    expect(img.x).toBeCloseTo(CROP_STAGE_INSET);
    expect(img.w).toBeCloseTo(STAGE.w - 2 * CROP_STAGE_INSET);
    expect(img.y + img.h / 2).toBeCloseTo(STAGE.h / 2);
  });
});

describe('the Rotate animation', () => {
  const stage = { w: STAGE.w, h: STAGE.h };
  const fits = (natW: number, natH: number) => {
    const from = insetContainRect(natW, natH, stage.w, stage.h);
    const turned = turnedSize({ w: natW, h: natH }, 1);
    const to = insetContainRect(turned.w, turned.h, stage.w, stage.h);
    const s = quarterTurnScale(from, to);
    // The turned view's on-screen box: its sides swap, then scale.
    return { from, to, s, shownW: from.h * s, shownH: from.w * s };
  };

  it('shrinks a portrait photo turning landscape to fit the stage, inside the inset', () => {
    const { from, to, s, shownW, shownH } = fits(3024, 4032);
    expect(s).toBeLessThan(1);
    expect(shownW).toBeCloseTo(to.w);
    expect(shownH).toBeCloseTo(to.h);
    expect(shownW).toBeLessThanOrEqual(stage.w - 2 * CROP_STAGE_INSET + 1e-9);
    expect(shownH).toBeLessThanOrEqual(stage.h - 2 * CROP_STAGE_INSET + 1e-9);
    // Turned about its own centre, which is the stage's centre, as is the target's.
    expect(from.x + from.w / 2).toBeCloseTo(to.x + to.w / 2);
    expect(from.y + from.h / 2).toBeCloseTo(to.y + to.h / 2);
  });

  it('grows a landscape photo turning portrait, and still fits', () => {
    const { s, shownW, shownH, to } = fits(4032, 3024);
    expect(s).toBeGreaterThan(1);
    expect(shownW).toBeCloseTo(to.w);
    expect(shownH).toBeCloseTo(to.h);
    expect(shownH).toBeLessThanOrEqual(stage.h - 2 * CROP_STAGE_INSET + 1e-9);
  });
});
