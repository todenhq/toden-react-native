// ---------------------------------------------------------------------------
// Every colour of the cartoon person (liveness/toonFace.ts) as a shade of the
// workflow's own colour: skin, hair and clothes alike, so the person has no
// skin colour and stands for anyone.
//
// The web SDK hands these to CSS variables mixed with `color-mix`
// (liveness/toon-shades.ts); react-native-svg cannot resolve `var()`, so here
// the same mixes are worked out to concrete colours and written into the
// drawing. Change a mix in one and change both.
// ---------------------------------------------------------------------------

export type ToonColour = 'skin' | 'hair' | 'clothes' | 'light' | 'ink' | 'mouth' | 'tongue' | 'line';

/** How much of the primary, over what: the web's `color-mix(in srgb, …)`. */
const MIXES: Record<ToonColour, readonly [number, string]> = {
  skin: [0.22, '#ffffff'],
  hair: [0.4, '#000000'],
  clothes: [1, '#000000'],
  light: [0, '#ffffff'],
  ink: [0.4, '#000000'],
  mouth: [0.45, '#000000'],
  tongue: [0.5, '#ffffff'],
  line: [0.3, '#000000'],
};

/** What a colour that cannot be read falls back to: the SDK's own primary. */
const FALLBACK = '#5645F5';

type Rgb = [number, number, number];

function parse(colour: string): Rgb | null {
  const hex = colour.trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(hex)
    ? hex
        .split('')
        .map((c) => c + c)
        .join('')
    : /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)
      ? hex.slice(0, 6)
      : null;
  if (!full) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const toHex = (rgb: Rgb): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `share` of `primary` over `base`, as `color-mix(in srgb, primary share, base)`. */
export function mixPrimary(primary: string, share: number, base: string): string {
  const p = parse(primary) ?? parse(FALLBACK)!;
  const b = parse(base)!;
  return toHex([0, 1, 2].map((i) => p[i]! * share + b[i]! * (1 - share)) as Rgb);
}

export function toonShades(primary: string): Record<ToonColour, string> {
  const out = {} as Record<ToonColour, string>;
  for (const [name, [share, base]] of Object.entries(MIXES) as [ToonColour, readonly [number, string]][]) {
    out[name] = mixPrimary(primary, share, base);
  }
  return out;
}

/**
 * The room behind a picture of the camera: a soft dusk, leaning to the
 * workflow's colour so the picture sits with it. The web's
 * `linear-gradient(160deg, …)`, as its two stops.
 */
export function cameraRoom(primary: string): { from: string; to: string } {
  return { from: mixPrimary(primary, 0.28, '#66708a'), to: mixPrimary(primary, 0.22, '#3b4257') };
}

/**
 * One part of the drawing with its colours written in. A mask's own shape is
 * painted white: the drawing asks for an alpha mask, and white makes the same
 * cut whether a renderer reads the mask by its alpha or by its brightness.
 */
export function paintToon(part: string, shades: Record<ToonColour, string>): string {
  const masked = part.replace(/(<mask\b[^>]*>)([\s\S]*?)(<\/mask>)/g, (_, open: string, inner: string, close: string) =>
    `${open}${inner.replace(/var\(--toon-[a-z]+\)/g, '#ffffff')}${close}`,
  );
  return masked.replace(/var\(--toon-([a-z]+)\)/g, (whole, name: string) =>
    name in shades ? shades[name as ToonColour] : whole,
  );
}
