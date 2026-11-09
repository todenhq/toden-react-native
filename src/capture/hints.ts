import type { DocumentHint } from './documentIdentity';

// ---------------------------------------------------------------------------
// Capture hint copy.
//
// One instruction per rejection reason. Deliberately imperative and specific:
// a single message ("Align your ID within the frame") told the user nothing
// about WHICH way to move, and the commonest failure — holding the document
// too close — is the one people cannot guess, because the instinct on "it isn't
// reading" is to move nearer still.
//
// Copy is document-agnostic. `label` is the ID's own name so the same strings
// serve a passport, a card or a licence without special-casing any of them.
//
// Verbatim from the Flutter SDK's capture_hints.dart — keep the two identical.
// ---------------------------------------------------------------------------

export function documentHintText(hint: DocumentHint, label: string): string {
  switch (hint) {
    case 'searching':
      return `Point the camera at your ${label}`;
    case 'moreLight':
      return 'Too dark. Move somewhere brighter';
    case 'wrongDocument':
      // "your", not "a": an article chosen by letter misreads labels said as
      // letters or acronyms ("an SSNIT", "a NIN").
      return `That doesn't look like your ${label}`;
    case 'showMrz':
      return 'Include the code strip along the bottom of the page';
    case 'moveCloser':
      return 'Move closer';
    case 'moveBack':
      // The one users don't reach for on their own.
      return `Move back a little. Fit the whole ${label} in view`;
    case 'centre':
      return `Centre your ${label} in the frame`;
    // The four-corner gate. Fixed wording (no label) so all three SDKs say
    // exactly the same thing.
    case 'noDocument':
      return 'Place your ID inside the frame';
    case 'cornerCutOff':
      return 'Fit all four corners of your ID inside the frame';
    case 'tooClose':
      return 'Move back a little so there is space around your ID';
    case 'showBack':
      return `That's still the front. Turn your ${label} over`;
    case 'holdStill':
      return 'Hold still…';
    case 'captured':
      return 'Got it';
    default:
      return `Point the camera at your ${label}`;
  }
}

/**
 * True when the hint is asking the user to change something, so the UI can
 * give it more weight than the neutral prompts.
 */
export function documentHintIsAction(hint: DocumentHint): boolean {
  return (
    hint === 'moreLight' ||
    hint === 'wrongDocument' ||
    hint === 'showMrz' ||
    hint === 'moveCloser' ||
    hint === 'moveBack' ||
    hint === 'centre' ||
    hint === 'noDocument' ||
    hint === 'cornerCutOff' ||
    hint === 'tooClose' ||
    hint === 'showBack'
  );
}
