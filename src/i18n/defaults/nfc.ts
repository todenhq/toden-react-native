// The document chip (NFC) step.
//
// Keys this SDK shows. The body texts match the web SDK's and Flutter's word for
// word, so the builder preview shows what applicants read; the title keeps this
// SDK's Title Case, as its other steps do. NOT_SHOWN lists
// the group's keys that name a place this SDK has no screen for, with the reason.

export const NFC_TEXTS: Record<string, string> = {
  // Sheet headers (components/stepHeaderCopy.ts, stepHeaderMeta.tsx).
  'nfc.title': 'Scan Document Chip',
  'nfc.description': 'Hold your document flat against the back of your phone until it’s read.',

  // The read (screens/nfc/NfcReadProgress.tsx, NfcReadActions.tsx, NfcMrzPrompt.tsx).
  'nfc.waiting': 'Waiting for the chip',
  'nfc.skip': 'Continue without the chip',
};

export const NFC_NOT_SHOWN: Record<string, string> = {};
