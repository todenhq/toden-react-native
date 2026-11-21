// Button presses for the verification timeline ("Clicked Continue on
// capturing document"). Mirrors the web SDK's lib/click-log.ts; keep the two in
// lockstep. React Native has no document to listen on, so the SDK's shared
// buttons (UiButton, GlassIconButton) report their own presses here.
//
// PRIVACY: a press is recorded by the CATALOGUE KEY of the button's label, and
// only when the label is exactly a piece of the SDK's own copy as this workflow
// shows it. A name, an address or a company in a list is not catalogue copy, so
// it can never be recorded; such a press counts as unnamed, never described.
import { DEFAULT_TEXTS } from '../i18n/defaults';
import type { TextFn } from '../i18n/types';
import { recordClick } from './step-log';

export const UNNAMED_CONTROL = 'unnamed';

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

const lookups = new WeakMap<TextFn, Map<string, string>>();

/**
 * Every catalogue text as this workflow shows it, to its key. A shared text
 * ("Continue") takes the shared `common.*` key, so one button reads the same
 * on every step; otherwise the first key wins.
 */
function lookupFor(t: TextFn): Map<string, string> {
  const cached = lookups.get(t);
  if (cached) return cached;
  const map = new Map<string, string>();
  const keys = Object.keys(DEFAULT_TEXTS);
  const ordered = [...keys.filter((k) => k.startsWith('common.')), ...keys.filter((k) => !k.startsWith('common.'))];
  for (const key of ordered) {
    const shown = normalise(t(key));
    if (shown && !map.has(shown)) map.set(shown, key);
  }
  lookups.set(t, map);
  return map;
}

/** The English default for a key, placeholders removed, for the dashboard to read. */
function englishLabel(key: string): string {
  return normalise((DEFAULT_TEXTS[key] ?? '').replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/g, ''));
}

/** A button named by its catalogue key: the visible label first, then its accessible name. */
export function controlFor(labels: Array<string | null | undefined>, t: TextFn): { control: string; label: string } {
  const lookup = lookupFor(t);
  for (const text of labels) {
    const key = text ? lookup.get(normalise(text)) : undefined;
    if (key) return { control: key, label: englishLabel(key) };
  }
  return { control: UNNAMED_CONTROL, label: '' };
}

/**
 * A press of a control the SDK names itself (the shutter, an icon with no
 * label): `control` and `label` are fixed SDK words, never applicant data.
 */
export function logControl(control: string, label: string): void {
  try {
    recordClick(control, label);
  } catch {
    // Nothing to do: the press itself still goes through.
  }
}

/** A press of a control whose words are one catalogue key ("common.retake"). */
export function logKey(key: string): void {
  logControl(key, englishLabel(key));
}

/**
 * What kind of thing was chosen from a list, for the dashboard to say "Chose
 * an ID type". The choice itself (which ID, which country) is never recorded
 * here: it is already on the verification, and a list may hold data.
 */
export const CHOICE_LABELS: Record<string, string> = { idType: 'an ID type', country: 'a country' };

export function logChoice(kind: string): void {
  logControl(`choice.${kind}`, CHOICE_LABELS[kind] ?? 'an option');
}

/** Records one press. Never throws: a timeline line must not cost the applicant their tap. */
export function logPress(labels: Array<string | null | undefined>, t: TextFn): void {
  try {
    const hit = controlFor(labels, t);
    recordClick(hit.control, hit.label);
  } catch {
    // Nothing to do: the press itself still goes through.
  }
}
