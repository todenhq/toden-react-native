import { resolveText } from '../i18n/translate';
import type { TextFn, TextVars } from '../i18n/types';
import type { IconName } from './Icon';

// ---------------------------------------------------------------------------
// "Here's what happens next" copy.
//
// A port of the Flutter SDK's ready_primer_content.dart and the web SDK's
// ready-primer-content.ts. Kept as data in ONE place per platform so the
// document and liveness screens cannot drift from each other, and so the three
// SDKs can be diffed string-for-string.
//
// Any change here must be mirrored in the other two — someone who starts on the
// hosted web flow and finishes in a native app should read the same words.
// ---------------------------------------------------------------------------

export interface ReadyChecklistItem {
  icon: IconName;
  label: string;
}

export interface ReadyContent {
  icon: IconName;
  title: string;
  /** A sentence under the title. Empty: the title stands alone. */
  body: string;
  /** What to expect. Three at most; past that nobody reads it. */
  checklist: ReadyChecklistItem[];
  /**
   * The catalogue entries (`primer.*`) ReadyPrimer shows in place of the
   * English above, so a workflow's copy reaches every screen that uses this.
   */
  textKeys?: { title: string; body: string; checklist: string[] };
  /** What the texts' `{placeholders}` stand for, such as the document's name. */
  textVars?: TextVars;
  /**
   * Show the sentence only where the workflow has written its own, and leave
   * the SDK's stock one out: for a screen whose picture already says it.
   */
  ownBodyOnly?: boolean;
  /** The same for the title: for a screen whose step heading already says it. */
  ownTitleOnly?: boolean;
  /**
   * Keep the tinted box round the screen's picture, as the glyph has it. The
   * liveness picture stands on the page by itself: its own window is its
   * frame, and a box round it would be a frame round a frame.
   */
  heroBoxed?: boolean;
}

export const READY_DOCUMENT: ReadyContent = {
  icon: 'scan-line',
  title: "You're about to scan your document",
  body: "We'll read the details for you. Nothing is shared until you submit.",
  checklist: [
    { icon: 'id-card', label: 'Have your document with you' },
    { icon: 'sun', label: 'Find even lighting, avoid glare' },
    { icon: 'timer', label: 'Takes a few seconds' },
  ],
  textKeys: {
    title: 'primer.document.title',
    body: 'primer.document.body',
    checklist: ['primer.document.checklist1', 'primer.document.checklist2', 'primer.document.checklist3'],
  },
  // The document's picture sits in the screen's tinted box.
  heroBoxed: true,
};

export const READY_LIVENESS: ReadyContent = {
  icon: 'scan-face',
  title: "Let's confirm you're really here",
  // The picture above the title (screens/liveness/GesturePreview) shows what
  // is about to happen, so the stock sentence under it is left out. A
  // workflow's own sentence is still shown.
  body: '',
  ownBodyOnly: true,
  // No "put your face in the circle": the picture above shows the window,
  // and the camera says it when the face is not in it.
  checklist: [
    { icon: 'glasses', label: 'Take off glasses, hats, caps or anything covering your face' },
    { icon: 'sun', label: 'Choose a bright spot, with the light in front of you' },
    { icon: 'zap-off', label: 'Keep glare and shiny reflections off your face' },
  ],
  textKeys: {
    title: 'primer.selfie.title',
    body: 'primer.selfie.body',
    checklist: ['primer.selfie.checklist2', 'primer.selfie.checklist4', 'primer.selfie.checklist5'],
  },
};

/** Passive Liveness asks for no gestures, so its picture shows none (the
 *  step passes GesturePreview `passive`), and a workflow's own description
 *  for it is kept apart. */
export const READY_LIVENESS_PASSIVE: ReadyContent = {
  ...READY_LIVENESS,
  textKeys: { ...READY_LIVENESS.textKeys!, body: 'primer.selfie.bodyPassive' },
};

/**
 * The document screen for the document the person chose: its short name in
 * the words (`{document}` in the texts: "Passport", not "International
 * Passport"). The step's heading above already names the document and says
 * what to do, so the stock title and sentence under the picture are left
 * out; a workflow's own words for them are still shown.
 */
export function documentReady(name: string): ReadyContent {
  return { ...READY_DOCUMENT, textVars: { document: name }, ownTitleOnly: true, ownBodyOnly: true };
}

/**
 * The words the primer shows: the workflow's for each key, else the SDK's,
 * with the stock title or sentence left out (empty) where the content asks
 * for a workflow's own words only.
 */
export function primerWords(
  content: ReadyContent,
  t: TextFn,
): { title: string; body: string; checklist: ReadyChecklistItem[] } {
  const keys = content.textKeys;
  const vars = content.textVars;
  const own = (key: string, text: string): boolean => text !== resolveText(key, { vars });
  const title = keys ? t(keys.title, vars) : content.title;
  const body = keys ? t(keys.body, vars) : content.body;
  return {
    title: content.ownTitleOnly && keys && !own(keys.title, title) ? '' : title,
    body: content.ownBodyOnly && keys && !own(keys.body, body) ? '' : body,
    checklist: content.checklist.map((row, i) => {
      const key = keys?.checklist[i];
      return key ? { ...row, label: t(key, vars) } : row;
    }),
  };
}
