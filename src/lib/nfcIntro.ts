// What the chip step says BEFORE the read starts: what is about to happen and
// how to hold the document. Most people have never had a phone read a passport
// and do not know the chip is in the cover, so the read waits for them to say
// they are ready. The same wording lives in the web SDK (lib/nfc-intro.ts) and
// Flutter (config/nfc_intro.dart); keep the three in step.

export type NfcIntroPlatform = 'ios' | 'android' | 'other';

/** Passports keep the chip in a cover; cards keep it inside the card. */
export function isPassportId(idKey: string | null | undefined): boolean {
  return idKey != null && idKey.toLowerCase().includes('passport');
}

/** Which glyph a row shows; each SDK maps these to its own icon set. */
export type NfcIntroIcon = 'camera' | 'passport' | 'card' | 'phone' | 'hold';

export interface NfcIntroRow {
  icon: NfcIntroIcon;
  title: string;
  caption: string;
  /** Already done (the photo page, read during document capture): a check. */
  done?: boolean;
}

/**
 * The screen, in the shape of the address-monitoring explanation (the same
 * hero, grouped rows and highlighted "before you start" card).
 */
export interface NfcIntroCopy {
  title: string;
  description: string;
  rows: NfcIntroRow[];
  /** The highlighted card under the rows: a small lead, then the action. */
  before: { lead: string; tap: string };
}

/** Where the phone's reader is: the top edge on an iPhone, mid-back on Android. */
function restCaption(platform: NfcIntroPlatform): string {
  if (platform === 'ios') return 'Rest the top of your iPhone on it.';
  if (platform === 'android') return 'Rest the middle of the back of your phone on it.';
  return 'Rest the back of your phone on it.';
}

/**
 * The intro for this document and phone. The photo page leads either way: done,
 * with a check, when document capture already read the code that unlocks the
 * chip (the usual case), or still to do when it did not (`needsCode`), so the
 * camera opening next is no surprise.
 */
export function nfcIntroCopy({
  passport,
  platform,
  needsCode,
}: {
  passport: boolean;
  platform: NfcIntroPlatform;
  needsCode: boolean;
}): NfcIntroCopy {
  const doc = passport ? 'passport' : 'card';
  const rows: NfcIntroRow[] = [
    needsCode
      ? { icon: 'camera', title: 'Scan the photo page', caption: 'Its printed code unlocks the chip.' }
      : { icon: 'camera', title: 'Photo page scanned', caption: 'Its printed code unlocks the chip.', done: true },
    passport
      ? { icon: 'passport', title: 'Close your passport', caption: 'Lay it on a flat surface.' }
      : { icon: 'card', title: 'Lay your card flat', caption: 'On a table or another flat surface.' },
    {
      icon: 'phone',
      title: passport ? 'Place your phone on the front cover' : 'Place your phone on the card',
      caption: restCaption(platform),
    },
    {
      icon: 'hold',
      title: 'Hold still for a few seconds',
      caption: passport
        ? 'If nothing happens, try the back cover.'
        : 'Keep both still until the read finishes.',
    },
  ];
  return {
    title: `Your ${doc} has a chip`,
    description: `Your phone can read it to confirm your ${doc} is genuine. Here is how.`,
    rows,
    before: { lead: 'Before you start', tap: 'Take off a thick phone case' },
  };
}
