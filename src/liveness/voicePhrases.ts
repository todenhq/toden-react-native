// ---------------------------------------------------------------------------
// Toden voice clips: the manifest, the clip URLs, and how a line on screen is
// matched to a clip. Pure; the loading and playing live in voiceClips.ts.
//
// The contract is kyc-core docs/VOICE_GUIDANCE.md, shared with the web and
// Flutter SDKs. A clip plays only for the exact text it was recorded from
// (after normalising), so a reworded prompt falls back to the device voice
// instead of saying something the screen does not.
// ---------------------------------------------------------------------------

export interface VoiceManifest {
  /** Changes whenever any clip changes; part of every clip URL. */
  version: string;
  voices: Record<string, { languages: string[] }>;
  /** Language, then phrase key, then the clip's exact text. */
  phrases: Record<string, Record<string, string>>;
}

const VOICE_ASSETS_PATH = '/api/kyc/assets/voices';

function trimSlash(server: string): string {
  return server.replace(/\/+$/, '');
}

export function voiceManifestUrl(server: string): string {
  return `${trimSlash(server)}${VOICE_ASSETS_PATH}/manifest.json`;
}

export function voiceClipUrl(
  server: string,
  manifest: VoiceManifest,
  voice: string,
  language: string,
  phraseKey: string,
): string {
  const parts = [manifest.version, voice, language, `${phraseKey}.mp3`].map(encodeURIComponent);
  return `${trimSlash(server)}${VOICE_ASSETS_PATH}/${parts.join('/')}`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
  );
}

/** The manifest, or null for anything that is not one. */
export function parseVoiceManifest(body: unknown): VoiceManifest | null {
  if (!body || typeof body !== 'object') return null;
  const { version, voices, phrases } = body as Record<string, unknown>;
  if (typeof version !== 'string' || !version) return null;
  if (!voices || typeof voices !== 'object' || !phrases || typeof phrases !== 'object') return null;
  if (!Object.values(phrases as Record<string, unknown>).every(isStringRecord)) return null;
  return body as VoiceManifest;
}

/** Whether the manifest has clips for this voice in this language (primary subtag). */
export function manifestHasVoice(manifest: VoiceManifest, voice: string, language: string): boolean {
  const languages = manifest.voices[voice]?.languages;
  return Array.isArray(languages) && languages.includes(language) && !!manifest.phrases[language];
}

const CURLY_APOSTROPHES = /[‘’ʼ]/g;
const NOT_LETTER_DIGIT_APOSTROPHE_OR_SPACE = /[^\p{L}\p{N}' ]/gu;

/**
 * The form a line and a clip's text are compared in, the same in all three
 * SDKs: NFKC, lower case, curly apostrophes made straight, everything but
 * letters, digits, `'` and spaces removed, runs of spaces collapsed, trimmed.
 * So "Hold still…", "Hold still." and "hold still" all match `Hold still`.
 */
export function normalisePhrase(text: string): string {
  let composed = text;
  try {
    composed = text.normalize('NFKC');
  } catch {
    /* a Hermes build without normalize compares the text as it is */
  }
  return composed
    .toLowerCase()
    .replace(CURLY_APOSTROPHES, "'")
    .replace(NOT_LETTER_DIGIT_APOSTROPHE_OR_SPACE, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Normalised text to phrase key, for one language of the manifest. */
export function phraseKeyMap(manifest: VoiceManifest, language: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, text] of Object.entries(manifest.phrases[language] ?? {})) {
    map.set(normalisePhrase(text), key);
  }
  return map;
}
