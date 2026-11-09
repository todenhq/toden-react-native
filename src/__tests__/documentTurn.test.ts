import {
  DEFAULT_READ_TURN,
  documentCropGuide,
  guideFractions,
  guideRect,
  immersiveBand,
  readProvesTurn,
  screenGuideAspect,
  turnsDocument,
  undoDegrees,
} from '../capture/documentTurn';
import { guideCropRect } from '../services/cardCrop';
import { CARD_GUIDE_ASPECT, NIN_SLIP_GUIDE_ASPECT, PASSPORT_GUIDE_ASPECT } from '../config/idTypes';

// A NIN slip is framed upright on a phone held upright, so it uses the screen's
// height between the camera's controls instead of its width. Mirrored by the
// Flutter and web SDKs: keep the numbers in step.

const PHONE = { width: 393, height: 852 };

describe('turnsDocument', () => {
  it('turns a NIN slip on a view taller than it is wide', () => {
    expect(turnsDocument(NIN_SLIP_GUIDE_ASPECT, PHONE.width / PHONE.height)).toBe(true);
  });

  it('never turns a card or a passport page', () => {
    expect(turnsDocument(CARD_GUIDE_ASPECT, 0.46)).toBe(false);
    expect(turnsDocument(PASSPORT_GUIDE_ASPECT, 0.46)).toBe(false);
  });

  it('keeps a landscape view (a phone on its side, a tablet) as it is', () => {
    expect(turnsDocument(NIN_SLIP_GUIDE_ASPECT, 1.6)).toBe(false);
    expect(turnsDocument(NIN_SLIP_GUIDE_ASPECT, 0)).toBe(false);
  });

  it('draws the turned guide upright', () => {
    expect(screenGuideAspect(NIN_SLIP_GUIDE_ASPECT, true)).toBeCloseTo(1 / 2.07, 5);
    expect(screenGuideAspect(NIN_SLIP_GUIDE_ASPECT, false)).toBe(NIN_SLIP_GUIDE_ASPECT);
  });
});

describe('guideRect', () => {
  it('leaves a landscape guide exactly where it was: 88% wide, centred', () => {
    const r = guideRect(PHONE.width, PHONE.height, CARD_GUIDE_ASPECT);
    expect(r.width).toBeCloseTo(393 * 0.88, 5);
    expect(r.height).toBeCloseTo((393 * 0.88) / CARD_GUIDE_ASPECT, 5);
    expect(r.y + r.height / 2).toBeCloseTo(PHONE.height / 2, 5);
  });

  it('fits an upright slip between the top controls and the bottom bar', () => {
    const band = immersiveBand(56, 34);
    const r = guideRect(PHONE.width, PHONE.height, 1 / NIN_SLIP_GUIDE_ASPECT, band);
    expect(r.y).toBeGreaterThanOrEqual(band.topReserve - 0.001);
    expect(r.y + r.height).toBeLessThanOrEqual(PHONE.height - band.bottomReserve + 0.001);
    expect(r.height / r.width).toBeCloseTo(NIN_SLIP_GUIDE_ASPECT, 5);
    // Larger than today's landscape frame (346 x 167 pt) in pixels.
    const landscape = guideRect(PHONE.width, PHONE.height, NIN_SLIP_GUIDE_ASPECT);
    expect(r.width * r.height).toBeGreaterThan(1.4 * landscape.width * landscape.height);
  });

  it('is never wider than 88% of the view', () => {
    const r = guideRect(300, 4000, 1 / NIN_SLIP_GUIDE_ASPECT, { topReserve: 0, bottomReserve: 0 });
    expect(r.width).toBeCloseTo(300 * 0.88, 5);
  });
});

describe('guideCropRect', () => {
  it('crops the photo pixels behind the drawn guide', () => {
    // A 3024x4032 photo shown cover-fit in a 393x852 view: the sides are cut.
    const view = PHONE.width / PHONE.height;
    const band = immersiveBand(56, 34);
    const rect = guideRect(PHONE.width, PHONE.height, 1 / NIN_SLIP_GUIDE_ASPECT, band);
    const crop = guideCropRect(3024, 4032, view, guideFractions(rect, PHONE.width, PHONE.height));
    expect(crop.height / crop.width).toBeCloseTo(NIN_SLIP_GUIDE_ASPECT, 2);
    expect(crop.originX).toBeGreaterThan(0);
    expect(crop.originX + crop.width).toBeLessThan(3024);
    expect(crop.originY + crop.height).toBeLessThan(4032);
  });
});

describe('undoDegrees', () => {
  it('turns the capture back the way the reader read it', () => {
    expect(undoDegrees(1)).toBe(90);
    expect(undoDegrees(3)).toBe(270);
  });

  it('assumes the default direction when nothing was read', () => {
    expect(DEFAULT_READ_TURN).toBe(3);
    expect(undoDegrees(null)).toBe(270);
    expect(undoDegrees(0)).toBe(270);
  });
});

describe('readProvesTurn', () => {
  it('accepts a read that names the slip', () => {
    expect(readProvesTurn(['National Identity Management System', 'NIMC', 'Tracking ID: S7Y0'], 'NG', 'nin-slip')).toBe(true);
  });

  it('rejects a read taken the wrong way round, which comes back as garbage', () => {
    expect(readProvesTurn(['wəʇsʎs ʇuəɯəƃ', 'DIWN ', '0Y7S :QI', 'ƃuᴉʞɔɐɹ'], 'NG', 'nin-slip')).toBe(false);
    expect(readProvesTurn([], 'NG', 'nin-slip')).toBe(false);
  });

  it('proves nothing for a document with no keywords', () => {
    expect(readProvesTurn(['NIMC'], 'ZZ', 'nin-slip')).toBe(false);
  });
});

describe('documentCropGuide', () => {
  const phone = PHONE.width / PHONE.height;

  it('stands a NIN slip upright on a phone, as the camera guide does', () => {
    const crop = documentCropGuide(NIN_SLIP_GUIDE_ASPECT, phone);
    expect(crop.turned).toBe(true);
    expect(crop.aspect).toBeCloseTo(1 / NIN_SLIP_GUIDE_ASPECT);
    expect(crop.aspect).toBe(screenGuideAspect(NIN_SLIP_GUIDE_ASPECT, turnsDocument(NIN_SLIP_GUIDE_ASPECT, phone)));
  });

  it('keeps cards and passports landscape on a phone', () => {
    expect(documentCropGuide(CARD_GUIDE_ASPECT, phone)).toEqual({ aspect: CARD_GUIDE_ASPECT, turned: false });
    expect(documentCropGuide(PASSPORT_GUIDE_ASPECT, phone)).toEqual({ aspect: PASSPORT_GUIDE_ASPECT, turned: false });
  });

  it('keeps a NIN slip landscape on a screen wider than tall', () => {
    expect(documentCropGuide(NIN_SLIP_GUIDE_ASPECT, PHONE.height / PHONE.width)).toEqual({
      aspect: NIN_SLIP_GUIDE_ASPECT,
      turned: false,
    });
  });
});
