import { lightingOf, faceLuma } from './light-level';

describe('lightingOf', () => {
  it('passes a well-lit face in front of a dark room', () => {
    // The whole frame is dark (the room); the face patch is well lit.
    expect(lightingOf({ brightness: 30, faceCount: 1, faceRgb: [95, 80, 70] })).toBeNull();
  });

  it('still says too dark when the face itself is dark', () => {
    expect(lightingOf({ brightness: 30, faceCount: 1, faceRgb: [30, 25, 22] })).toBe('dark');
  });

  it('judges the whole frame with no face, or no face patch', () => {
    expect(lightingOf({ brightness: 30, faceCount: 0, faceRgb: [95, 80, 70] })).toBe('dark');
    expect(lightingOf({ brightness: 30, faceCount: 1, faceRgb: [-1, -1, -1] })).toBe('dark');
    expect(lightingOf({ brightness: 120, faceCount: 1 })).toBeNull();
    expect(lightingOf({ brightness: 240, faceCount: 0 })).toBe('bright');
  });

  it('says too bright when the face is washed out', () => {
    expect(lightingOf({ brightness: 90, faceCount: 1, faceRgb: [250, 245, 240] })).toBe('bright');
  });
});

describe('faceLuma', () => {
  it('reads nothing from an unsampled patch', () => {
    expect(faceLuma(undefined)).toBeNull();
    expect(faceLuma([-1, -1, -1])).toBeNull();
  });
});
