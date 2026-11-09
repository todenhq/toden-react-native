// The business-documents step's own wording: the web SDK's business.documents.*
// defaults, one entry per key (named beside it). Not customisable texts here:
// the shared contract (customisable_texts_vectors.json) does not name these
// keys, so they are not in DEFAULT_TEXTS (customisableTexts.test.ts holds that
// list to the contract).

export const BUSINESS_DOCUMENTS_COPY = {
  /** business.documents.status.required */
  required: 'Required',
  /** business.documents.status.optional */
  optional: 'Optional',
  /** business.documents.status.next */
  next: 'Next',
  /** business.documents.accepts */
  accepts: 'Any one of these',
  /** business.documents.acceptsOne */
  acceptsOne: 'Upload this document',
  /** business.documents.validity */
  validity: (months: number): string => `From the last ${months} months`,
  /** business.documents.progress */
  progress: (current: number, total: number): string => `${current} of ${total}`,
  /** Announced when a group opens: business.documents.progress, then its title. */
  opened: (current: number, total: number, title: string): string => `${current} of ${total}: ${title}`,
  /** business.documents.uploaded */
  uploaded: 'Uploaded',
  /** business.documents.uploading */
  uploading: 'Uploading…',
  /** business.documents.replace */
  replace: 'Replace',
  /** business.documents.remove */
  remove: 'Remove',
  /** business.documents.skipped: an earlier group left without a document. */
  skipped: 'Skipped',
  /** business.documents.change: reopen an earlier group. */
  change: 'Change',
  /** business.documents.next: the button on every group but the last. */
  nextButton: 'Next',
  /** business.documents.skip */
  skip: 'Skip',
  /** business.documents.drop.tap: the upload area's title on a phone. */
  tapToChoose: 'Tap to choose a file',
  /** business.documents.errorUpload */
  errorUpload: 'Upload failed. Please check your connection and try again.',
} as const;
