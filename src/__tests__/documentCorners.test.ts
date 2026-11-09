import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CORNER_BLEED,
  EDGE_EPSILON,
  MIN_AREA_FRACTION,
  bleedCropRect,
  cornersProblem,
  type DocumentQuad,
} from '../capture/documentCorners';

interface Vectors {
  bleed: number;
  edgeEpsilon: number;
  minAreaFraction: number;
  problems: { name: string; visible: { left: number; top: number; right: number; bottom: number }; quad: DocumentQuad | null; expected: string | null }[];
  crops: { name: string; frame: { width: number; height: number }; quad: DocumentQuad; expected: { x: number; y: number; width: number; height: number } }[];
}

const vectors = JSON.parse(
  readFileSync(join(__dirname, '../capture/documentCorners.vectors.json'), 'utf8'),
) as Vectors;

// The vectors are shared, verbatim, with the web and Flutter SDKs: a rule that
// passes here and fails there is a rule the SDKs disagree on.
describe('document corners (shared vectors)', () => {
  it('uses the shared constants', () => {
    expect(CORNER_BLEED).toBe(vectors.bleed);
    expect(EDGE_EPSILON).toBe(vectors.edgeEpsilon);
    expect(MIN_AREA_FRACTION).toBe(vectors.minAreaFraction);
  });

  describe('cornersProblem', () => {
    for (const v of vectors.problems) {
      it(v.name, () => {
        expect(cornersProblem(v.quad, v.visible, vectors.bleed)).toBe(v.expected);
      });
    }
  });

  describe('bleedCropRect', () => {
    for (const v of vectors.crops) {
      it(v.name, () => {
        expect(bleedCropRect(v.quad, v.frame, vectors.bleed)).toEqual(v.expected);
      });
    }
  });

  it('treats corners a native build could not report as no document', () => {
    const quad = { topLeft: { x: NaN, y: 0.2 }, topRight: { x: 0.9, y: 0.2 }, bottomRight: { x: 0.9, y: 0.75 }, bottomLeft: { x: 0.1, y: 0.75 } };
    expect(cornersProblem(quad, { left: 0, top: 0, right: 1, bottom: 1 })).toBe('no_document');
  });
});
