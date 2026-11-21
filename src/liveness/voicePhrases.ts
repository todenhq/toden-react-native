// ---------------------------------------------------------------------------
// Toden voice clips: the manifest, the clip URLs, and how a line on screen is
// matched to a clip. Pure; the loading and playing live in voiceClips.ts.
//
// The contract is kyc-core docs/VOICE_GUIDANCE.md, shared with the web and
// Flutter SDKs. A clip plays only for the exact text it was recorded from
// (after normalising), so a reworded prompt falls back to the device voice
// instead of saying something the screen does not.
// ---------------------------------------------------------------------------

import { primaryLanguage } from '../config/voiceGuidance';

export interface VoiceManifest {
  /** Changes whenever any clip changes; part of every clip URL. */
  version: string;
  voices: Record<string, ManifestVoice>;
  /** Whose voices may speak to a country Toden has no voice from, best first; absent from an older server. */
  neighbours?: Record<string, string[]>;
  /** The country whose voices speak when nothing nearer does (US); absent from an older server. */
  fallbackCountry?: string;
  /** Language, then phrase key, then the clip's exact text. */
  phrases: Record<string, Record<string, string>>;
}

/** One voice in the manifest. An older server sends `languages` alone. */
export interface ManifestVoice {
  languages: string[];
  gender?: 'female' | 'male';
  /** ISO 3166-1 alpha-2; absent where the accent is not one country's. */
  country?: string;
  /** False for a voice Toden no longer offers: playable where named, never chosen for anyone. */
  offered?: boolean;
}

/** Who the prompts are for, and how a voice is matched to them. */
export interface VoiceApplicant {
  /** A gender, either, or `off`: their own country and its neighbours are skipped. */
  choice: 'female' | 'male' | 'any' | 'off';
  /** The country of the document being verified, ISO-2; unknown until one is picked. */
  country?: string | null;
  /** The same for one person all session, so their voice does not change part way. */
  seed: string;
  /** A neighbouring country's voice where their own has none. Default true. */
  neighbours?: boolean;
}

/** FNV-1a, 32 bit: one person's seed to a number that is the same on every run and every Toden SDK. */
export function voiceSeedNumber(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The voice that speaks for this person (kyc-core docs/VOICE_GUIDANCE.md, "Who
 * speaks, from SDK 4.4.0"), or null for the device's voice: their own country's,
 * a neighbouring country's, the workflow's own `voice`, then an American voice.
 * `off` skips the first two. The same rule as the web SDK's pickVoice.
 */
export function pickVoice(
  manifest: VoiceManifest,
  source: { voice?: string; language: string; applicant?: VoiceApplicant },
): string | null {
  const lang = primaryLanguage(source.language);
  const voices = manifest.voices ?? {};
  const speaks = (id: string) => voices[id]?.languages?.includes(lang) === true;
  const workflowVoice = source.voice && speaks(source.voice) ? source.voice : null;
  const who = source.applicant;
  if (!who) return workflowVoice;

  const from = (code: string) =>
    Object.keys(voices)
      .filter((id) => voices[id]!.country === code.toUpperCase() && voices[id]!.offered !== false && speaks(id))
      .sort();
  const gender = who.choice === 'off' ? 'any' : who.choice;
  const ofGender = (ids: string[]) => (gender === 'any' ? ids : ids.filter((id) => voices[id]!.gender === gender));
  const preferred = (ids: string[]) => (ofGender(ids).length > 0 ? ofGender(ids) : ids);
  const one = (ids: string[]) => ids[voiceSeedNumber(who.seed) % ids.length]!;

  const country = who.country?.trim().toUpperCase();
  if (who.choice !== 'off' && country) {
    const own = from(country);
    if (own.length > 0) return one(preferred(own));
    if (who.neighbours !== false) {
      const nearby = (manifest.neighbours?.[country] ?? []).map(from);
      const matching = nearby.map(ofGender).find((ids) => ids.length > 0) ?? nearby.find((ids) => ids.length > 0);
      if (matching) return one(matching);
    }
  }
  if (workflowVoice) return workflowVoice;
  const fallback = manifest.fallbackCountry ? from(manifest.fallbackCountry) : [];
  return fallback.length > 0 ? one(preferred(fallback)) : null;
}

/** A seed for this app session, for a person the app did not name (no `userId`). */
export const SESSION_VOICE_SEED = Math.random().toString(36).slice(2);

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
