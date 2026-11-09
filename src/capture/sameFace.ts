// ---------------------------------------------------------------------------
// Is the camera still looking at the side it just photographed?
//
// Auto-capture has no way of telling the back of a card from its front by
// branding: a back carries little, and the gate relaxes for it. What it can do
// is compare. The two faces of a document say different things, so a "back"
// whose words are mostly the front's is the front, still held up.
//
// Compares against the words read off THIS document a moment ago, so it needs no
// list of what any ID prints and works the same for every country. OCR drops and
// misreads words between frames, which is why it asks for most of them rather
// than all, and it stays silent on a front with too few words to judge by. It
// only ever holds the automatic shutter: the manual one stays live.
// ---------------------------------------------------------------------------

/** Below this a front has too little text to recognise again. */
const MIN_FRONT_WORDS = 6;
/** Share of the front's words seen again before it counts as the same face. */
const SAME_FACE_SHARE = 0.55;

export function wordsOf(lines: string[]): Set<string> {
  const words = new Set<string>();
  for (const line of lines) {
    for (const word of line.toUpperCase().split(/[^A-Z0-9]+/)) {
      if (word.length >= 3) words.add(word);
    }
  }
  return words;
}

export function stillSameFace(front: Set<string> | null, lines: string[]): boolean {
  if (!front || front.size < MIN_FRONT_WORDS) return false;
  const seen = wordsOf(lines);
  let shared = 0;
  for (const word of front) if (seen.has(word)) shared += 1;
  return shared / front.size >= SAME_FACE_SHARE;
}
