// The sample document shown in the capture guide when the camera opens, so the
// person sees what to hold up and which way round: a passport looks like a
// passport with PASSPORT written on it, a licence like a licence. Pure: it
// returns SVG text, which the viewfinder draws and a test can read.
//
// It carries the ID's own name and the country, and SPECIMEN wherever a real
// document would print a person, so nobody could take it for a real one.
import {
  INK, barcode, chip, chipMark, fieldRows, fitSize, label, mrz, portrait, signature, stackedBarcode,
} from './documentSpecimenParts';

export type SpecimenKind = 'passport' | 'national_id' | 'nin_slip' | 'drivers_license' | 'voter_card' | 'residence_permit' | 'generic';

const KINDS: Record<string, SpecimenKind> = {
  passport: 'passport',
  'drivers-license': 'drivers_license',
  'national-id': 'national_id',
  nin: 'national_id',
  vnin: 'national_id',
  'nin-slip': 'nin_slip',
  'ghana-card': 'national_id',
  cni: 'national_id',
  pvc: 'voter_card',
  voters: 'voter_card',
  'residence-card': 'residence_permit',
  'residence-permit': 'residence_permit',
};

export function specimenKind(idType: string | null | undefined): SpecimenKind {
  return (idType && KINDS[idType]) || 'generic';
}

export interface SpecimenInput {
  kind: SpecimenKind;
  /** The ID's own name, as the flow shows it. */
  title: string;
  /** The country's name. Left off when unknown. */
  country?: string | null;
  side: 'front' | 'back';
  /** Width over height, the guide's own. */
  aspect: number;
  accent: string;
  /** Font families the device has. */
  sans: string;
  mono: string;
}

const WIDTH = 1000;
const INSET = 44;

function shell(height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}">
<rect x="6" y="6" width="${WIDTH - 12}" height="${height - 12}" rx="40" fill="#FFFFFF" fill-opacity="0.8"/>
${body}
<rect x="6" y="6" width="${WIDTH - 12}" height="${height - 12}" rx="40" fill="none" stroke="${INK}" stroke-width="10"/>
</svg>`;
}

/** The faint security pattern behind the printing. */
function guilloche(cx: number, cy: number, accent: string): string {
  return [150, 210, 270, 330, 390]
    .map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="3" stroke-opacity="0.14"/>`)
    .join('');
}

/** A crest: the shape every issuer prints, in no country's design. */
function crest(cx: number, cy: number, r: number, accent: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${accent}" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${accent}"/>`;
}

function passport(i: SpecimenInput, height: number): string {
  const { sans, mono, accent } = i;
  const country = (i.country ?? 'COUNTRY').toUpperCase();
  const name = printedTitle(i.title, 380, 38, 3);
  const lineChars = 44;
  const first = 'P<<<SPECIMEN<<SAMPLE'.padEnd(lineChars, '<');
  const second = '000000000<0<<<0000000<0000000'.padEnd(lineChars, '<');
  return [
    guilloche(760, 300, accent),
    label(country, INSET, 90, fitSize(country, 400, 48, 4), { font: sans, weight: 800, tracking: 4 }),
    chipMark(510, 74, 56, INK),
    label(name.text, WIDTH - INSET, 88, name.size, { font: sans, weight: 800, tracking: 3, anchor: 'end' }),
    portrait(INSET, 124, 232, 366, accent, 'pp'),
    fieldRows(316, 136, [[[130, 330], [100, 250]], [[100, 390], [80, 190]], [[160, 300], [110, 280]], [[120, 370], [90, 200]]], 68),
    signature(320, 412, 1.05),
    mrz(INSET, height - 86, [first, second], WIDTH - INSET * 2, 31, 50, mono),
  ].join('');
}

/** A title that fits at a readable size, without its bracket if that is what it takes. */
function printedTitle(title: string, maxWidth: number, size: number, tracking: number): { text: string; size: number } {
  const full = title.toUpperCase();
  const short = full.replace(/\s*\(.*\)\s*$/, '');
  const fullSize = fitSize(full, maxWidth, size, tracking);
  return fullSize >= size * 0.8 || short === full
    ? { text: full, size: fullSize }
    : { text: short, size: fitSize(short, maxWidth, size, tracking) };
}

/** The coloured band across the top of a card, with its two names. */
function cardBand(i: SpecimenInput): string {
  const country = (i.country ?? 'COUNTRY').toUpperCase();
  const name = printedTitle(i.title, 520, 38, 2);
  return `<path d="M6 46A40 40 0 0 1 46 6H954A40 40 0 0 1 994 46V116H6Z" fill="${i.accent}"/>
${label(country, INSET, 78, fitSize(country, 340, 40, 3), { font: i.sans, weight: 800, tracking: 3, color: '#FFFFFF' })}
${label(name.text, WIDTH - INSET, 76, name.size, { font: i.sans, weight: 800, tracking: 2, anchor: 'end', color: '#FFFFFF' })}`;
}

const TALL_FIELDS: Array<Array<[number, number]>> = [[[120, 330]], [[100, 400]], [[140, 280]]];

function cardFront(i: SpecimenInput): string {
  const { kind, accent } = i;
  const parts = [guilloche(780, 420, accent), cardBand(i), portrait(INSET, 146, 232, 340, accent, 'cd')];
  if (kind === 'drivers_license') {
    parts.push(
      fieldRows(312, 158, TALL_FIELDS.slice(0, 3), 72),
      fieldRows(756, 158, [[[80, 190]], [[70, 150]]], 72),
      ...['A', 'B', 'C'].map((c, n) => `<rect x="${312 + n * 84}" y="396" width="68" height="68" rx="12" fill="none" stroke="${INK}" stroke-width="5"/>${label(c, 346 + n * 84, 445, 40, { font: i.sans, anchor: 'middle', weight: 800 })}`),
      signature(590, 400, 1.05),
      fieldRows(INSET, 520, [[[150, 340], [120, 260], [90, 220]]], 66, 34),
    );
  } else if (kind === 'voter_card') {
    parts.push(
      fieldRows(312, 158, TALL_FIELDS, 72),
      `<circle cx="840" cy="226" r="76" fill="#FFFFFF" fill-opacity="0.6" stroke="${accent}" stroke-width="8"/><path d="M806 226L830 254L878 198" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
      signature(320, 392, 1.05),
      barcode(INSET, 512, WIDTH - INSET * 2, 72),
    );
  } else if (kind === 'residence_permit') {
    parts.push(
      fieldRows(312, 158, TALL_FIELDS, 72),
      crest(880, 214, 56, accent),
      signature(320, 392, 1.05),
      `<rect x="${INSET}" y="508" width="${WIDTH - INSET * 2}" height="76" rx="14" fill="${accent}" fill-opacity="0.12"/>`,
      fieldRows(INSET + 26, 524, [[[120, 240], [120, 240], [100, 200]]], 66, 40),
    );
  } else {
    const chipped = kind === 'national_id';
    parts.push(
      fieldRows(312, 158, TALL_FIELDS, 72),
      chipped ? chip(826, 150) : crest(880, 214, 56, accent),
      signature(320, 392, 1.05),
      fieldRows(INSET, 520, [[[150, 340], [120, 260], [90, 220]]], 66, 34),
    );
  }
  return parts.join('');
}

function cardBack(i: SpecimenInput, height: number): string {
  const band = cardBand(i);
  if (i.kind === 'drivers_license') {
    return [band, fieldRows(INSET, 148, [[[130, 400], [100, 300]], [[110, 330], [130, 370]]], 70), stackedBarcode(INSET, 300, WIDTH - INSET * 2, height - 346)].join('');
  }
  if (i.kind === 'voter_card' || i.kind === 'generic') {
    return [band, fieldRows(INSET, 152, [[[130, 420], [90, 280]], [[100, 340], [120, 360]], [[150, 300], [90, 300]]], 72), barcode(INSET, height - 216, WIDTH - INSET * 2, 170)].join('');
  }
  const lines = ['I<<<000000000<0<<<<<<<<<<<<<<<', '0000000<0000000<<<<<<<<<<<<<<0', 'SPECIMEN<<SAMPLE<<<<<<<<<<<<<<'];
  return [
    band,
    fieldRows(INSET, 150, [[[130, 400], [100, 300]], [[110, 330], [130, 370]]], 70),
    `<rect x="24" y="${height - 298}" width="952" height="274" rx="20" fill="${INK}" fill-opacity="0.05"/>`,
    mrz(INSET, height - 216, lines, WIDTH - INSET * 2, 48, 80, i.mono),
  ].join('');
}

/**
 * The long NIN slip (2.07 to 1, measured off real slips): two headings across
 * the top, the name fields down the left, the address and the NIN on the right.
 * No photo and no chip, as on the paper slip. One side only.
 */
function ninSlip(i: SpecimenInput, height: number): string {
  const { sans, mono, accent } = i;
  const country = (i.country ?? 'COUNTRY').toUpperCase();
  const name = printedTitle(i.title, 600, 36, 2);
  return [
    guilloche(500, height / 2 + 40, accent),
    crest(INSET + 46, 92, 38, accent),
    crest(WIDTH - INSET - 46, 92, 38, accent),
    label(country, WIDTH / 2, 82, fitSize(country, 600, 30, 3), { font: sans, weight: 800, tracking: 3, anchor: 'middle' }),
    label(name.text, WIDTH / 2, 126, name.size, { font: sans, weight: 800, tracking: 2, anchor: 'middle', color: accent }),
    `<rect x="${INSET}" y="152" width="${WIDTH - INSET * 2}" height="4" rx="2" fill="${INK}" fill-opacity="0.18"/>`,
    fieldRows(INSET, 186, [[[120, 300]], [[100, 260]], [[130, 300]], [[110, 240]]], 64),
    fieldRows(540, 186, [[[110, 400]], [[0, 320]]], 40),
    `<rect x="530" y="${height - 150}" width="${WIDTH - INSET - 530}" height="100" rx="18" fill="${accent}" fill-opacity="0.1"/>`,
    label('NIN', 556, height - 112, 26, { font: sans, weight: 800, tracking: 2, color: accent }),
    label('00000000000', 556, height - 68, 46, { font: mono, weight: 700, tracking: 4 }),
  ].join('');
}

/** Viewbox height for the guide's aspect, so the sample fills it exactly. */
export function specimenHeight(aspect: number): number {
  return Math.round(WIDTH / aspect);
}

export function documentSpecimen(input: SpecimenInput): string {
  const height = specimenHeight(input.aspect);
  const body =
    input.kind === 'passport' ? passport(input, height)
      : input.kind === 'nin_slip' ? ninSlip(input, height)
        : input.side === 'back' ? cardBack(input, height) : cardFront(input);
  return shell(height, body);
}

