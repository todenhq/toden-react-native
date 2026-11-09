import { judgeCorners } from '../capture/cornerGate';
import { exceedsGuide } from '../capture/documentCorners';

// A NIN slip held too close runs off the picture, and the detector finds the
// bordered table printed inside it instead, which sits fully in view: the
// corner check passed and the capture cut the slip's edges off (2026-11-02).
// A document much bigger than the drawn guide is now "too close".

const quad = (l: number, t: number, r: number, b: number) => ({
  topLeft: { x: l, y: t }, topRight: { x: r, y: t }, bottomRight: { x: r, y: b }, bottomLeft: { x: l, y: b },
});
// The upright guide on a 393 x 852 view, as shares of the view.
const guide = { x: 0.225, y: 0.19, width: 0.55, height: 0.53 };

describe('the guide bounds the size of the found document', () => {
  it('passes a slip that fills the guide', () => {
    const r = { kind: 'measured' as const, quad: quad(0.22, 0.19, 0.78, 0.72), frameAspect: null };
    expect(judgeCorners(r, 393 / 852, guide)).toBeNull();
  });

  it('calls a slip far bigger than the guide too close, though its box is in view', () => {
    const r = { kind: 'measured' as const, quad: quad(0.1, 0.08, 0.86, 0.8), frameAspect: null };
    expect(judgeCorners(r, 393 / 852, guide)).toBe('too_close');
  });

  it('changes nothing without a guide (landscape documents)', () => {
    const r = { kind: 'measured' as const, quad: quad(0.1, 0.08, 0.86, 0.8), frameAspect: null };
    expect(judgeCorners(r, 393 / 852)).toBeNull();
  });

  it('allows a little over the guide', () => {
    const g = { left: 0.2, top: 0.2, right: 0.8, bottom: 0.8 };
    expect(exceedsGuide(quad(0.18, 0.18, 0.82, 0.82), g)).toBe(false);
    expect(exceedsGuide(quad(0.1, 0.1, 0.9, 0.9), g)).toBe(true);
  });
});
