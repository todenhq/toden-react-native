import { SHEET_TOP_GAP, sheetMaxHeight } from '../lib/sheet-height';

// A long sheet (the key person form) grew under the status bar. The tallest a
// sheet may be is the screen less the status bar, a gap, the 8 float and any
// keyboard lift; a caller's own lower cap still wins.
describe('sheetMaxHeight', () => {
  it('stops a sheet the gap below the status bar', () => {
    // iPhone 16 Pro Max: 956 tall, 62 status bar, 8 float.
    expect(sheetMaxHeight(956, 62, 8, 0)).toBe(956 - 62 - SHEET_TOP_GAP - 8);
  });

  it('leaves room for a raised keyboard', () => {
    expect(sheetMaxHeight(956, 62, 8, 336)).toBe(956 - 62 - SHEET_TOP_GAP - 8 - 336);
  });

  it('keeps a caller cap that is lower', () => {
    expect(sheetMaxHeight(956, 62, 8, 0, 500)).toBe(500);
    expect(sheetMaxHeight(956, 62, 8, 0, 2000)).toBe(956 - 62 - SHEET_TOP_GAP - 8);
  });
});
