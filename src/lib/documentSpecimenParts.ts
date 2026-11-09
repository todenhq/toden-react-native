// The drawing kit for the document specimens (documentSpecimen.ts). Pure: every
// function returns SVG text, so a specimen can be tested and rendered anywhere.

export const INK = '#12141F';
export const MUTED = '#6B7083';
export const BAR = '#9A9EAD';
export const PANEL = '#E4E6EE';

/**
 * Text as SvgXml will print it. Its parser copies text exactly as written and
 * decodes no entities, so `&lt;` would appear on the document as those four
 * characters. A bare `<` would end the text, so the angle brackets become their
 * lookalikes, and everything else goes through untouched.
 */
export function printable(text: string): string {
  return text.replace(/</g, '\u2039').replace(/>/g, '\u203A');
}

/**
 * The size that fits `text` in `maxWidth`. React Native cannot measure SVG text,
 * so this estimates from the widest case: capitals in a bold face at about 0.68
 * of the size, plus the tracking. It only ever shrinks.
 */
export function fitSize(text: string, maxWidth: number, size: number, tracking = 0, min = 24): number {
  const needed = text.length * (size * 0.68 + tracking);
  return needed <= maxWidth ? size : Math.max(min, Math.floor((size * maxWidth) / needed));
}

export function label(text: string, x: number, y: number, size: number, opts: { color?: string; anchor?: 'start' | 'end' | 'middle'; tracking?: number; weight?: number; font: string }): string {
  const { color = INK, anchor = 'start', tracking = 0, weight = 700, font } = opts;
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" letter-spacing="${tracking}" text-anchor="${anchor}" fill="${color}">${printable(text)}</text>`;
}

/** A printed field: a pale caption over a darker value. */
export function field(x: number, y: number, caption: number, value: number): string {
  return `<rect x="${x}" y="${y}" width="${caption}" height="9" rx="4.5" fill="${BAR}" opacity="0.55"/><rect x="${x}" y="${y + 19}" width="${value}" height="14" rx="7" fill="${MUTED}"/>`;
}

/** Two rows of fields, as a document prints them. */
export function fieldRows(x: number, y: number, rows: Array<Array<[number, number]>>, step = 66, gap = 34): string {
  return rows
    .map((row, r) => {
      let left = x;
      return row
        .map(([caption, value]) => {
          const drawn = field(left, y + r * step, caption, value);
          left += Math.max(caption, value) + gap;
          return drawn;
        })
        .join('');
    })
    .join('');
}

/** The holder: a drawn person, never a real face. Designed in a 200 × 240 box. */
export function portrait(x: number, y: number, w: number, h: number, accent: string, id: string): string {
  const scale = Math.max(w / 200, h / 240);
  const ox = x + (w - 200 * scale) / 2;
  const oy = y + h - 240 * scale;
  const line = `stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${PANEL}"/>
<g clip-path="url(#${id})"><g transform="translate(${ox} ${oy}) scale(${scale})">
<path d="M6 244C10 196 52 176 100 176C148 176 190 196 194 244Z" fill="#FFFFFF" ${line}/>
<path d="M80 148V176C88 194 112 194 120 176V148" fill="#FFFFFF" ${line}/>
<ellipse cx="51" cy="104" rx="9" ry="14" fill="#FFFFFF" ${line}/><ellipse cx="149" cy="104" rx="9" ry="14" fill="#FFFFFF" ${line}/>
<path d="M54 92C54 150 76 166 100 166C124 166 146 150 146 92C146 62 124 48 100 48C76 48 54 62 54 92Z" fill="#FFFFFF" ${line}/>
<path d="M50 100C42 52 72 24 108 24C138 24 160 50 150 100C146 84 138 74 126 66C106 76 84 76 70 68C60 76 54 86 50 100Z" fill="${INK}"/>
<circle cx="82" cy="106" r="4.5" fill="${INK}"/><circle cx="118" cy="106" r="4.5" fill="${INK}"/>
<path d="M100 114C97 122 96 126 96 128C98 130 102 130 104 129" fill="none" ${line}/><path d="M86 143C94 151 106 151 114 143" fill="none" ${line}/>
</g></g>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="none" stroke="${accent}" stroke-width="8"/>`;
}

/** A signature, drawn so it needs no script font on the device. */
export function signature(x: number, y: number, scale = 1): string {
  return `<path transform="translate(${x} ${y}) scale(${scale})" d="M4 44C18 8 36 0 34 18C32 36 14 62 24 62C36 62 44 34 56 34C62 34 56 52 64 52C72 52 76 34 84 34C92 34 84 52 92 52C102 52 108 30 118 32C128 34 116 54 128 52C142 50 150 28 164 30C176 32 158 56 174 52C190 48 214 34 238 36" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A gold contact chip, the mark of a chipped card. */
export function chip(x: number, y: number): string {
  const w = 104;
  const h = 80;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#E9C46A" stroke="${INK}" stroke-width="4"/>
<path d="M${x + 34} ${y}V${y + h}M${x + 70} ${y}V${y + h}M${x} ${y + 27}H${x + 34}M${x + 70} ${y + 27}H${x + w}M${x} ${y + 53}H${x + 34}M${x + 70} ${y + 53}H${x + w}" fill="none" stroke="${INK}" stroke-width="3"/>`;
}

/**
 * The e-passport mark, the symbol ICAO has every chipped passport carry: a frame
 * with a circle at its centre and a line either side. Designed to read at the size
 * of a word on the page.
 */
export function chipMark(cx: number, cy: number, height: number, color: string): string {
  const width = height * 1.5;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const ring = height * 0.25;
  const line = `fill="none" stroke="${color}" stroke-width="${height * 0.1}"`;
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${height * 0.14}" ${line}/>
<circle cx="${cx}" cy="${cy}" r="${ring}" ${line}/>
<path d="M${left} ${cy}H${cx - ring}M${cx + ring} ${cy}H${left + width}" ${line}/>`;
}

/** A linear barcode. The widths repeat a fixed pattern, so it never encodes anything. */
export function barcode(x: number, y: number, width: number, height: number): string {
  const pattern = [3, 1, 2, 1, 4, 2, 1, 3, 1, 1, 2, 3, 1, 2, 4, 1, 1, 3];
  let bars = '';
  let left = x;
  for (let i = 0; left < x + width; i += 1) {
    const w = pattern[i % pattern.length]! * 4;
    if (i % 2 === 0) bars += `<rect x="${left}" y="${y}" width="${Math.min(w, x + width - left)}" height="${height}" fill="${INK}"/>`;
    left += w;
  }
  return bars;
}

/** A two-dimensional barcode block, the kind on the back of a licence. */
export function stackedBarcode(x: number, y: number, width: number, height: number): string {
  const rows = 9;
  const rowH = height / rows;
  let out = '';
  for (let r = 0; r < rows; r += 1) {
    let left = x;
    for (let i = 0; left < x + width; i += 1) {
      const w = 5 + (((i + 1) * (r + 3) * 7) % 4) * 5;
      if ((i + r) % 2 === 0) out += `<rect x="${left}" y="${y + r * rowH}" width="${Math.min(w, x + width - left)}" height="${rowH - 2}" fill="${INK}"/>`;
      left += w;
    }
  }
  return out;
}

/**
 * The machine-readable zone, filled with SPECIMEN so it reads as a sample.
 *
 * Every character gets its own cell across `width`, as the real zone is printed,
 * so the lines fit exactly whatever the device's monospace font measures. The
 * filler `<` cannot be text at all (see printable), so each one is drawn.
 */
export function mrz(x: number, y: number, lines: string[], width: number, size: number, step: number, font: string): string {
  const cell = width / Math.max(...lines.map((line) => line.length));
  const reach = size * 0.2;
  const rise = size * 0.26;
  return lines
    .map((line, row) => {
      const baseline = y + row * step;
      const middle = baseline - size * 0.36;
      let filler = '';
      let characters = '';
      [...line].forEach((character, column) => {
        const centre = x + cell * (column + 0.5);
        if (character === '<') {
          filler += `M${centre + reach} ${middle - rise}L${centre - reach} ${middle}L${centre + reach} ${middle + rise}`;
        } else {
          characters += label(character, centre, baseline, size, { font, anchor: 'middle' });
        }
      });
      return `${characters}<path d="${filler}" fill="none" stroke="${INK}" stroke-width="${size * 0.1}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
}
