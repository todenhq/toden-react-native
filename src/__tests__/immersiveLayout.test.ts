import { guideRect, immersiveBand, screenGuideAspect } from '../capture/documentTurn';
import {
  BOTTOM_ROW_HEIGHT,
  GUIDE_GAP_ABOVE_CONTROLS,
  GUIDE_GAP_BELOW_HINT,
  GUIDE_GAP_BELOW_TOP_BAR,
  HINT_MAX_HEIGHT,
  HINT_PADDING_V,
  HINT_LINE_HEIGHT,
  bottomRowReserve,
  hintBottom,
  hintTop,
  topBarTop,
  TOP_BAR_HEIGHT,
} from '../capture/immersiveLayout';
import { turnedHintBox } from '../capture/turnedHint';
import { immersiveHintTone, primaryOnDark } from '../components/viewfinder/immersiveGlass';
import { CARD_GUIDE_ASPECT, NIN_SLIP_GUIDE_ASPECT, PASSPORT_GUIDE_ASPECT } from '../config/idTypes';

// The full-screen document camera: top bar, instruction, guide, bottom row.
// The guide must keep clear of both, with the stated gaps, on every phone.

const PHONES = [
  { name: 'iPhone 15', width: 393, height: 852, top: 56, bottom: 34 },
  { name: 'iPhone 16 Pro Max', width: 440, height: 956, top: 56, bottom: 34 },
  { name: 'iPhone SE', width: 375, height: 667, top: 56, bottom: 0 },
  { name: 'small Android', width: 360, height: 740, top: 32, bottom: 16 },
];

describe('the layout rhythm', () => {
  it('puts the top bar 8 under the safe inset and the instruction 12 under the bar', () => {
    expect(topBarTop(56)).toBe(64);
    expect(hintTop(56)).toBe(64 + TOP_BAR_HEIGHT + 12);
    expect(HINT_MAX_HEIGHT).toBe(2 * HINT_LINE_HEIGHT + 2 * HINT_PADDING_V);
  });

  it('sits the bottom row 16 above the safe inset, captions included', () => {
    // Shutter 80; the 52 side buttons centred on it with a 6 gap and a 16 caption below.
    expect(BOTTOM_ROW_HEIGHT).toBe(88);
    expect(bottomRowReserve(34)).toBe(34 + 16 + 88);
  });
});

describe.each(PHONES)('the guide on $name', (phone) => {
  it('stands a turned NIN slip 16 below the top bar and 24 above the bottom row, centred between', () => {
    const band = immersiveBand(phone.top, phone.bottom);
    const g = guideRect(phone.width, phone.height, screenGuideAspect(NIN_SLIP_GUIDE_ASPECT, true), band);
    const above = g.y - (topBarTop(phone.top) + TOP_BAR_HEIGHT);
    const below = phone.height - bottomRowReserve(phone.bottom) - (g.y + g.height);
    expect(above).toBeGreaterThanOrEqual(GUIDE_GAP_BELOW_TOP_BAR - 0.001);
    expect(below).toBeGreaterThanOrEqual(GUIDE_GAP_ABOVE_CONTROLS - 0.001);
    expect(above - GUIDE_GAP_BELOW_TOP_BAR).toBeCloseTo(below - GUIDE_GAP_ABOVE_CONTROLS, 5);
    expect(g.height / g.width).toBeCloseTo(NIN_SLIP_GUIDE_ASPECT, 5);
  });

  it('leaves room beside a turned slip for its one-line hint', () => {
    const band = immersiveBand(phone.top, phone.bottom);
    const g = guideRect(phone.width, phone.height, screenGuideAspect(NIN_SLIP_GUIDE_ASPECT, true), band);
    expect(turnedHintBox(g).height).toBeGreaterThanOrEqual(HINT_LINE_HEIGHT + 2 * HINT_PADDING_V);
  });

  it.each([
    ['card', CARD_GUIDE_ASPECT],
    ['passport', PASSPORT_GUIDE_ASPECT],
  ])('keeps a %s guide 16 below a two-line instruction and 24 above the bottom row', (_, aspect) => {
    const g = guideRect(phone.width, phone.height, aspect);
    expect(g.y - hintBottom(phone.top)).toBeGreaterThanOrEqual(GUIDE_GAP_BELOW_HINT);
    expect(phone.height - bottomRowReserve(phone.bottom) - (g.y + g.height)).toBeGreaterThanOrEqual(
      GUIDE_GAP_ABOVE_CONTROLS,
    );
  });
});

describe('immersiveHintTone', () => {
  const base = { hint: 'searching' as const, framing: 'none' as const, hintIsAction: false, blocked: false };

  it('is neutral while searching', () => {
    expect(immersiveHintTone(base)).toBe('neutral');
  });

  it('is an action when the gate asks for one or holds the shutter', () => {
    expect(immersiveHintTone({ ...base, hint: 'moveCloser', framing: 'adjust', hintIsAction: true })).toBe('action');
    expect(immersiveHintTone({ ...base, blocked: true, framing: 'ready' })).toBe('action');
  });

  it('warns for too dark and the wrong document', () => {
    expect(immersiveHintTone({ ...base, hint: 'moreLight', hintIsAction: true })).toBe('warning');
    expect(immersiveHintTone({ ...base, hint: 'wrongDocument', hintIsAction: true })).toBe('warning');
    expect(immersiveHintTone({ ...base, framing: 'wrongShape' })).toBe('warning');
  });

  it('is ready while holding', () => {
    expect(immersiveHintTone({ ...base, hint: 'holdStill', framing: 'holding' })).toBe('ready');
    expect(immersiveHintTone({ ...base, hint: 'captured', framing: 'ready' })).toBe('ready');
  });
});

describe('primaryOnDark', () => {
  it('lifts the brand colour towards white and leaves other formats alone', () => {
    expect(primaryOnDark('#5645F5')).not.toBe('#5645F5');
    expect(primaryOnDark('#000000')).toBe('#595959');
    expect(primaryOnDark('rgb(1,2,3)')).toBe('rgb(1,2,3)');
  });
});
