// Each document side's still and its recording, kept as ONE pair.
//
// The server compares each still with the recording of the same side to catch
// an injected capture, so a recording from a different capture than its still
// is a wrong answer, not just untidy evidence. Two rules keep them paired:
//
//  • Every capture of a side gets a new number. A recording upload is stored
//    only while the capture it was made for is still that side's capture, so a
//    slow upload of a replaced capture can never land beside the new photo.
//  • Continue clears every document media id before uploading, then sets each
//    side's still and recording from this capture only. A retake with no
//    recording (a gallery photo, a clip that would not compress or upload, the
//    wait running out) therefore submits no recording rather than the old one,
//    and a back left from a two-sided ID picked earlier is not submitted with a
//    one-sided one.
//
// Pure, so the pairing is tested without a camera (documentRecordings.test.ts).

import type { MediaIdKey } from '../store/state';

export type DocumentRecordingSide = 'front' | 'back';

/** The media ids one document capture owns. */
export const DOCUMENT_MEDIA_KEYS: MediaIdKey[] = [
  'documentFront',
  'documentBack',
  'documentFrontVideo',
  'documentBackVideo',
];

const STILL_KEY: Record<DocumentRecordingSide, MediaIdKey> = { front: 'documentFront', back: 'documentBack' };
const RECORDING_KEY: Record<DocumentRecordingSide, MediaIdKey> = {
  front: 'documentFrontVideo',
  back: 'documentBackVideo',
};

/** One side's current capture: its recording (or none) and its number. */
export interface SideRecording {
  path: string | null;
  capture: number;
}

export type SideRecordings = Record<DocumentRecordingSide, SideRecording>;

export function emptySideRecordings(): SideRecordings {
  return { front: { path: null, capture: 0 }, back: { path: null, capture: 0 } };
}

/** A new capture of [side]: its own recording, or null for a gallery photo. */
export function recordCapture(recordings: SideRecordings, side: DocumentRecordingSide, path: string | null): void {
  recordings[side] = { path, capture: recordings[side].capture + 1 };
}

/** The side was retaken: nothing captured yet, and any upload in flight is stale. */
export function dropCapture(recordings: SideRecordings, side: DocumentRecordingSide): void {
  recordCapture(recordings, side, null);
}

export interface CapturedDocumentSide {
  side: DocumentRecordingSide;
  /** The still to upload. */
  uri: string;
  recording: string | null;
  /** The capture number when Continue was pressed. */
  capture: number;
}

export interface DocumentUploadDeps {
  /** Uploads a still; throws when it cannot (the step shows the error). */
  uploadStill: (uri: string, side: DocumentRecordingSide) => Promise<string>;
  /** Uploads a recording; null when it is skipped or fails (best-effort). */
  uploadRecording: (path: string, side: DocumentRecordingSide) => Promise<string | null>;
  setMediaId: (key: MediaIdKey, mediaId: string) => void;
  clearMediaIds: (keys: MediaIdKey[]) => void;
  /** Whether [capture] is still [side]'s current capture. */
  isCurrent: (side: DocumentRecordingSide, capture: number) => boolean;
  /** How long Continue waits for a recording before moving on. The upload
   *  keeps going after this and is stored if it lands in time. */
  recordingWaitMs: number;
}

/**
 * Uploads each side's still, then its own recording, and stores the ids.
 * Returns the stills uploaded, for the capture check. Throws when a still
 * fails to upload; a recording never throws.
 */
export async function uploadDocumentSides(
  sides: CapturedDocumentSide[],
  deps: DocumentUploadDeps,
): Promise<{ side: DocumentRecordingSide; mediaId: string }[]> {
  deps.clearMediaIds(DOCUMENT_MEDIA_KEYS);
  const uploaded: { side: DocumentRecordingSide; mediaId: string }[] = [];
  for (const { side, uri, recording, capture } of sides) {
    const mediaId = await deps.uploadStill(uri, side);
    deps.setMediaId(STILL_KEY[side], mediaId);
    uploaded.push({ side, mediaId });
    if (!recording) continue;
    const work = deps
      .uploadRecording(recording, side)
      .then((id) => {
        if (id && deps.isCurrent(side, capture)) deps.setMediaId(RECORDING_KEY[side], id);
      })
      .catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, deps.recordingWaitMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
  return uploaded;
}
