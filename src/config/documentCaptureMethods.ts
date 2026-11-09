// ---------------------------------------------------------------------------
// How the applicant may put a document in front of us.
//
// Two workflow switches, each on unless set to `false`: `allowDocumentScan`
// (photograph it with the live camera) and `allowDocumentUpload` (choose a
// photo of it from the device). The server refuses to publish a workflow with
// both off, but a stored or prop-supplied config can still carry that, and a
// document step with no way in is a dead end. So the camera comes back on in
// that case: it is the method the step was built around.
//
// Screens read the pair through here and never the raw keys, so the fallback
// is one rule rather than a check every screen has to remember. Mirrors the
// web and Flutter SDKs.
// ---------------------------------------------------------------------------

export interface DocumentCaptureMethods {
  /** Photograph the document with the live camera. */
  scan: boolean;
  /** Choose a photo of the document from the device. */
  upload: boolean;
}

export function documentCaptureMethods(config: {
  allowDocumentScan?: boolean;
  allowDocumentUpload?: boolean;
}): DocumentCaptureMethods {
  const upload = config.allowDocumentUpload !== false;
  // With upload off the camera is the only way left, whatever its flag says.
  const scan = upload ? config.allowDocumentScan !== false : true;
  return { scan, upload };
}

/** How a side's photo arrived. Mirrors the web and Flutter SDKs. */
export type DocumentSideSource = 'camera' | 'upload' | null;

/**
 * Whether a capture moves straight on, past the review screen: only when the
 * review is off unless the workflow asks for it, and even then only every side
 * scanned just now moves on. An
 * uploaded photo has had no look from anyone, so it keeps its preview.
 */
export function skipsDocumentReview(
  config: { documentReview?: boolean },
  sources: DocumentSideSource[],
): boolean {
  return config.documentReview !== true && sources.every((source) => source === 'camera');
}

export type AfterDocumentCapture = 'preview-front' | 'scan-back' | 'review' | 'hand-over';

/** Where a side's capture leads. The rule all three SDKs share. */
export function afterDocumentCapture(
  config: { documentReview?: boolean },
  capture: {
    side: 'front' | 'back';
    twoSided: boolean;
    front: DocumentSideSource;
    back: DocumentSideSource;
    /** A photo of the back is already held (a retake of the front). */
    hasBack: boolean;
  },
): AfterDocumentCapture {
  const { side, twoSided, front, back, hasBack } = capture;
  if (skipsDocumentReview(config, twoSided ? [front, back] : [front])) return 'hand-over';
  if (side === 'back' || !twoSided) return 'review';
  return !hasBack && skipsDocumentReview(config, [front]) ? 'scan-back' : 'preview-front';
}

/** Whether the document clip records sound. Off unless a workflow asked. */
export function recordsDocumentAudio(config: {
  documentAudio?: boolean;
  allowDocumentScan?: boolean;
  allowDocumentUpload?: boolean;
}): boolean {
  return config.documentAudio === true && documentCaptureMethods(config).scan;
}
