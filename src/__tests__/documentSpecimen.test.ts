import { dirname, join } from 'node:path';

import { specimenTitle } from '../config/idTypes';
import { documentSpecimen, specimenKind, type SpecimenInput } from '../lib/documentSpecimen';

// The parser SvgXml really draws with. A browser or a PDF tool decodes entities, so
// a preview made with one looks right while the phone prints `&lt;` on the document.
// Its two neighbours reach for native code, so they are stubbed by file.
const svgLib = join(dirname(require.resolve('react-native-svg/package.json')), 'lib/commonjs');
jest.doMock(join(svgLib, 'xmlTags.js'), () => ({
  tags: Object.fromEntries(['svg', 'g', 'text', 'rect', 'circle', 'ellipse', 'path', 'clipPath'].map((tag) => [tag, tag])),
}));
jest.doMock(join(svgLib, 'utils/fetchData.js'), () => ({ fetchText: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parse } = require(join(svgLib, 'xml.js')) as {
  parse: (source: string, middleware: (root: ParsedNode) => ParsedNode) => unknown;
};

interface ParsedNode {
  children: Array<ParsedNode | string>;
}

/** Every piece of text the phone will print, exactly as it will print it. */
function printedText(xml: string): string[] {
  const found: string[] = [];
  const walk = (node: ParsedNode): void => {
    for (const child of node.children) {
      if (typeof child === 'string') found.push(child);
      else walk(child);
    }
  };
  parse(xml, (root) => {
    walk(root);
    return root;
  });
  return found;
}

const ALL_SIDES = (['passport', 'national_id', 'drivers_license', 'drivers_license_ng', 'voter_card', 'pvc', 'residence_permit', 'generic'] as const)
  .flatMap((kind) => (['front', 'back'] as const).map((side) => ({ kind, side })));

/** Every tag closes, in order: what SvgXml needs to draw anything at all. */
function expectWellFormed(xml: string): void {
  const open: string[] = [];
  for (const match of xml.matchAll(/<(\/?)([a-zA-Z]+)[^>]*>/g)) {
    const [tag, slash, name] = match;
    if (!tag || !name) continue;
    if (tag.endsWith('/>')) continue;
    if (slash) expect(open.pop()).toBe(name);
    else open.push(name);
  }
  expect(open).toEqual([]);
}

const base: SpecimenInput = {
  kind: 'national_id',
  title: 'National ID',
  country: 'Ghana',
  side: 'front',
  aspect: 1.586,
  accent: '#5645F5',
  sans: 'sans-serif',
  mono: 'monospace',
};

describe('specimenKind', () => {
  it.each([
    ['passport', 'passport'],
    ['drivers-license', 'drivers_license'],
    ['national-id', 'national_id'],
    ['nin', 'national_id'],
    ['nin-slip', 'nin_slip'],
    ['ghana-card', 'national_id'],
    ['cni', 'national_id'],
    ['pvc', 'pvc'],
    ['voters', 'voter_card'],
    ['residence-card', 'residence_permit'],
  ])('%s draws as %s', (idType, kind) => {
    expect(specimenKind(idType)).toBe(kind);
  });

  it('draws an ID it does not know as a generic document, never a passport', () => {
    expect(specimenKind('ssnit')).toBe('generic');
    expect(specimenKind(null)).toBe('generic');
  });
});

describe('documentSpecimen', () => {
  it('writes the name of the document and its country on it', () => {
    const xml = documentSpecimen({ ...base, title: "Driver's Licence", kind: 'drivers_license' });
    expect(xml).toContain('GHANA');
    expect(xml.toUpperCase()).toContain('LICENCE');
  });

  it('says passport on a passport', () => {
    const xml = documentSpecimen({ ...base, kind: 'passport', title: 'Passport', aspect: 1.42 });
    expect(xml.toUpperCase()).toContain('PASSPORT');
  });

  it('keeps the same page whichever side a passport is asked for', () => {
    const passport = { ...base, kind: 'passport' as const, title: 'Passport', aspect: 1.42 };
    expect(documentSpecimen({ ...passport, side: 'back' })).toBe(documentSpecimen(passport));
  });

  it('draws a different face for the back of a card', () => {
    expect(documentSpecimen({ ...base, side: 'back' })).not.toBe(documentSpecimen(base));
  });

  it('prints a title as it was written, without letting it break the drawing', () => {
    const xml = documentSpecimen({ ...base, title: 'Tax & Levy <ID>', country: "Cote d'Ivoire" });
    expect(printedText(xml).join(' ')).toContain('TAX & LEVY \u2039ID\u203A');
    expectWellFormed(xml);
  });

  it.each(ALL_SIDES)('prints no entity and no filler as text on a $kind $side', ({ kind, side }) => {
    const input = { ...base, kind, side, title: 'Passport', aspect: kind === 'passport' ? 1.42 : 1.586 };
    const text = printedText(documentSpecimen(input));
    expect(text.length).toBeGreaterThan(0);
    for (const piece of text) {
      expect(piece).not.toMatch(/&[a-z#0-9]+;/i);
      expect(piece).not.toContain('<');
    }
  });

  it.each([
    ['passport', 1.42],
    ['national_id', 1.586],
    ['residence_permit', 1.586],
  ] as const)('keeps every machine-readable character inside a %s', (kind, aspect) => {
    const xml = documentSpecimen({ ...base, kind, aspect, side: kind === 'passport' ? 'front' : 'back' });
    const cells = [...xml.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>([A-Z0-9])<\/text>/g)];
    expect(cells.length).toBeGreaterThan(20);
    for (const cell of cells) {
      expect(Number(cell[1])).toBeGreaterThan(44);
      expect(Number(cell[1])).toBeLessThan(956);
    }
  });

  it('marks a passport with the e-passport symbol', () => {
    const xml = documentSpecimen({ ...base, kind: 'passport', title: 'Passport', aspect: 1.42 });
    expect(xml).toMatch(/<rect x="468" y="46" width="84" height="56"/);
    expect(xml).toMatch(/<circle cx="510" cy="74" r="14"/);
  });

  it('drops a bracketed abbreviation rather than shrink a long title out of reach', () => {
    const xml = documentSpecimen({
      ...base,
      title: 'Permanent Voter\'s Card With A Very Long Official Name (PVC)',
      kind: 'voter_card',
    });
    expect(xml).not.toContain('(PVC)');
  });

  it.each(['passport', 'national_id', 'nin_slip', 'drivers_license', 'drivers_license_ng', 'voter_card', 'pvc', 'residence_permit', 'generic'] as const)(
    '%s parses on both sides, with no country',
    (kind) => {
      for (const side of ['front', 'back'] as const) {
        expectWellFormed(documentSpecimen({ ...base, kind, side, country: null }));
      }
    },
  );
});

describe('the back of a document', () => {
  it('a NIN slip has no back to draw, so both sides are the slip', () => {
    const slip = { ...base, kind: 'nin_slip' as const, title: 'NIN Slip', country: 'Nigeria', aspect: 2.07 };
    const front = documentSpecimen(slip);
    expect(front).toContain('NIN SLIP');
    expect(front).toContain('00000000000');
    expect(documentSpecimen({ ...slip, side: 'back' })).toBe(front);
  });

  it.each(['national_id', 'drivers_license', 'drivers_license_ng', 'voter_card', 'pvc', 'residence_permit', 'generic'] as const)(
    '%s has its own back',
    (kind) => {
      const front = documentSpecimen({ ...base, kind });
      const back = documentSpecimen({ ...base, kind, side: 'back' });
      expect(back).not.toBe(front);
      expect(back).toContain('<rect');
    },
  );

  /** Where each barcode bar sits down the card, from the drawing itself. */
  const barcodeBars = (xml: string) =>
    [...xml.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="#12141F"\/>/g)]
      .map((bar) => ({ top: Number(bar[1]), bottom: Number(bar[1]) + Number(bar[2]) }));

  it("puts a PVC's two barcodes where the card has them: the top half of the back, the linear one first", () => {
    const bars = barcodeBars(documentSpecimen({ ...base, kind: 'pvc', side: 'back' }));
    const linear = bars.filter((bar) => bar.bottom - bar.top === 84);
    const stacked = bars.filter((bar) => bar.bottom - bar.top < 84);
    expect(linear.length).toBeGreaterThan(20);
    expect(stacked.length).toBeGreaterThan(100);
    expect(Math.max(...bars.map((bar) => bar.bottom))).toBeLessThan(Math.round(1000 / base.aspect) * 0.55);
    expect(Math.max(...linear.map((bar) => bar.bottom))).toBeLessThanOrEqual(Math.min(...stacked.map((bar) => bar.top)));
  });

  it("draws no barcode on a PVC's front: both of the card's barcodes are on its back", () => {
    expect(barcodeBars(documentSpecimen({ ...base, kind: 'pvc' }))).toHaveLength(0);
  });

  it("puts a Nigerian licence's barcodes in the top half of its back: a short linear one at the right, the block under it", () => {
    const xml = documentSpecimen({ ...base, kind: 'drivers_license_ng', side: 'back' });
    const bars = barcodeBars(xml);
    const linear = bars.filter((bar) => bar.bottom - bar.top === 44);
    const block = bars.filter((bar) => bar.bottom - bar.top !== 44);
    expect(linear.length).toBeGreaterThan(10);
    expect(block.length).toBeGreaterThan(100);
    expect(Math.max(...bars.map((bar) => bar.bottom))).toBeLessThan(Math.round(1000 / base.aspect) * 0.56);
    expect(Math.max(...linear.map((bar) => bar.bottom))).toBeLessThanOrEqual(Math.min(...block.map((bar) => bar.top)));
    // The linear barcode keeps to the right half, as on the card.
    const lefts = [...xml.matchAll(/<rect x="([\d.]+)" y="136" width="[\d.]+" height="44" fill="#12141F"\/>/g)].map((bar) => Number(bar[1]));
    expect(Math.min(...lefts)).toBeGreaterThanOrEqual(450);
  });

  it("draws a licence as Nigeria's own card only for Nigeria", () => {
    expect(specimenKind('drivers-license', 'NG')).toBe('drivers_license_ng');
    expect(specimenKind('drivers-license', 'ng')).toBe('drivers_license_ng');
    expect(specimenKind('drivers-license', 'GH')).toBe('drivers_license');
    expect(specimenKind('drivers-license', null)).toBe('drivers_license');
    expect(specimenKind('drivers-license')).toBe('drivers_license');
    // The country changes nothing for an ID that has no card of its own drawn.
    expect(specimenKind('passport', 'NG')).toBe('passport');
  });

  it("keeps any other country's licence barcode as one block in the lower half of its back", () => {
    const height = Math.round(1000 / base.aspect);
    const bars = barcodeBars(documentSpecimen({ ...base, kind: 'drivers_license', side: 'back' }));
    expect(bars.length).toBeGreaterThan(100);
    expect(Math.min(...bars.map((bar) => bar.top))).toBeGreaterThanOrEqual(300);
    expect(Math.max(...bars.map((bar) => bar.bottom))).toBeGreaterThan(height * 0.8);
  });

  it("leaves any other voter card's barcode along the foot of its back", () => {
    const bars = barcodeBars(documentSpecimen({ ...base, kind: 'voter_card', side: 'back' }));
    expect(bars.length).toBeGreaterThan(20);
    expect(Math.min(...bars.map((bar) => bar.top))).toBeGreaterThan(Math.round(1000 / base.aspect) / 2);
  });
});

describe('specimenTitle', () => {
  it('uses the label the step already has', () => {
    expect(specimenTitle('nin', 'National ID Number')).toBe('National ID Number');
  });

  it('never writes the word Document when the ID has a name', () => {
    expect(specimenTitle('drivers-license', 'Document')).toBe('Drivers License');
  });

  it('calls a passport a passport', () => {
    expect(specimenTitle('passport', 'International Passport')).toBe('Passport');
  });
});
