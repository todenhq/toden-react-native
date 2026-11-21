import { CIRCLE_MAX, CIRCLE_MIN, livenessLayout } from '../lib/livenessLayout';

// ─── The selfie circle fits the SHORT phone too ─────────────────────────────
//
// Two real devices are the vectors. On the iPhone the width rule stands; on
// the Samsung the height rule takes over. The same circles are pinned in
// Flutter's liveness_layout_test.dart.

describe('livenessLayout', () => {
  it('keeps the full circle on a tall phone (iPhone 16 Pro Max)', () => {
    expect(livenessLayout({ width: 440, height: 956 })).toEqual({ circle: 300 });
  });

  it('shrinks the circle on a short phone (Samsung S24, 360×780)', () => {
    expect(livenessLayout({ width: 360, height: 780 })).toEqual({ circle: 240 });
  });

  it('never drops below the floor on a very short screen (iPhone SE class)', () => {
    expect(livenessLayout({ width: 375, height: 667 }).circle).toBe(CIRCLE_MIN);
  });

  it('is bounded by the width on a narrow tall screen', () => {
    expect(livenessLayout({ width: 320, height: 956 })).toEqual({ circle: 256 });
  });

  it('never exceeds the cap and grows with the window', () => {
    expect(livenessLayout({ width: 1024, height: 2000 }).circle).toBe(CIRCLE_MAX);
    const short = livenessLayout({ width: 400, height: 760 }).circle;
    const tall = livenessLayout({ width: 400, height: 900 }).circle;
    expect(tall).toBeGreaterThan(short);
  });
});
