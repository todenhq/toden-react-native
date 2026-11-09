import { readFileSync } from 'fs';
import { join } from 'path';

import { sheetBorderColor } from '../config/theme';

// ─── Bottom sheets are solid ────────────────────────────────────────────────
//
// Every bottom sheet sits in FloatingSheet. On iOS 26 its panel was Liquid
// Glass, and the flow showing through made sheet text hard to read, so the
// panel is the flow's own background colour on every platform. A source check,
// because a translucent panel fails nothing at runtime: it only reads badly.

const source = readFileSync(join(__dirname, '../components/glass/FloatingSheet.tsx'), 'utf8');

describe('FloatingSheet panel', () => {
  it('draws on the theme background', () => {
    expect(source).toContain('backgroundColor: colors.background');
  });

  it('carries the brand-tinted edge', () => {
    expect(source).toContain('borderColor: sheetBorderColor(colors.primary, mode)');
  });

  it('is a faint pale line on a dark flow and a deeper tint on a light one', () => {
    expect(sheetBorderColor('#7B6EF7', 'dark')).toBe('#ebe9fe47');
    expect(sheetBorderColor('#5645F5', 'light')).toBe('#aba2fa');
  });

  it('holds no glass surface', () => {
    expect(source).not.toMatch(/GlassSurface|GlassSheet|GlassView/);
  });
});
