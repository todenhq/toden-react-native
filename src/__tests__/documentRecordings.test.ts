import { readFileSync } from 'fs';
import { join } from 'path';

import {
  DOCUMENT_MEDIA_KEYS,
  dropCapture,
  emptySideRecordings,
  recordCapture,
  uploadDocumentSides,
  type CapturedDocumentSide,
  type DocumentRecordingSide,
  type SideRecordings,
} from '../lib/documentRecordings';
import { buildVerifyRequest } from '../store/submit';
import { createVerificationStore } from '../store/verificationStore';
import type { ResolvedVerificationConfig } from '../types/config';

// A side's recording must always be the recording of the still submitted for
// that side: the server compares the two to catch an injected capture.
//
// The bug: a retake reset the step's own reference to the clip, but the store
// kept the recording id the earlier capture had uploaded, so a retake with no
// recording of its own (a gallery photo, a clip that would not upload) was
// submitted beside the earlier capture's recording. Seen on a development
// verification whose front recording was uploaded 23 minutes before its photo.

function makeStore() {
  return createVerificationStore({
    apiKey: 'pk_test_x',
    country: 'NG',
    metadata: {},
  } as unknown as ResolvedVerificationConfig);
}

type Store = ReturnType<typeof makeStore>;

let nextId = 0;

/** Continue, as the capture step runs it, against a fake API. */
function continueWith(
  store: Store,
  recordings: SideRecordings,
  sides: { side: DocumentRecordingSide; uri: string }[],
  uploadRecording: (path: string, side: DocumentRecordingSide) => Promise<string | null> = async (path) =>
    `med_video_${path}`,
) {
  const captured: CapturedDocumentSide[] = sides.map(({ side, uri }) => ({
    side,
    uri,
    recording: recordings[side].path,
    capture: recordings[side].capture,
  }));
  return uploadDocumentSides(captured, {
    uploadStill: async (uri) => `med_still_${uri}_${++nextId}`,
    uploadRecording,
    setMediaId: store.getState().setMediaId,
    clearMediaIds: store.getState().clearMediaIds,
    isCurrent: (side, capture) => recordings[side].capture === capture,
    recordingWaitMs: 50,
  });
}

const wire = (store: Store) => buildVerifyRequest(store.getState(), undefined).mediaIds ?? {};

describe('a side submits only its own recording', () => {
  it('a retake with no recording submits no recording for that side', async () => {
    const store = makeStore();
    const recordings = emptySideRecordings();
    recordCapture(recordings, 'front', 'front-take-1.mp4');
    await continueWith(store, recordings, [{ side: 'front', uri: 'front1.jpg' }]);
    expect(store.getState().mediaIds.documentFrontVideo).toBe('med_video_front-take-1.mp4');

    // Retake, then a photo from the gallery: no recording.
    dropCapture(recordings, 'front');
    recordCapture(recordings, 'front', null);
    await continueWith(store, recordings, [{ side: 'front', uri: 'front2.jpg' }]);

    expect(store.getState().mediaIds.documentFront).toMatch(/^med_still_front2\.jpg_/);
    expect(store.getState().mediaIds.documentFrontVideo).toBeUndefined();
    expect(wire(store)).not.toHaveProperty('documentFrontVideo');
  });

  it('a retake whose recording fails to upload submits no recording', async () => {
    const store = makeStore();
    const recordings = emptySideRecordings();
    recordCapture(recordings, 'back', 'back-take-1.mp4');
    await continueWith(store, recordings, [{ side: 'back', uri: 'back1.jpg' }]);

    dropCapture(recordings, 'back');
    recordCapture(recordings, 'back', 'back-take-2.mp4');
    await continueWith(store, recordings, [{ side: 'back', uri: 'back2.jpg' }], async () => null);

    expect(store.getState().mediaIds.documentBackVideo).toBeUndefined();
  });

  it('a retake with a recording submits the new one', async () => {
    const store = makeStore();
    const recordings = emptySideRecordings();
    recordCapture(recordings, 'front', 'front-take-1.mp4');
    await continueWith(store, recordings, [{ side: 'front', uri: 'front1.jpg' }]);

    dropCapture(recordings, 'front');
    recordCapture(recordings, 'front', 'front-take-2.mp4');
    await continueWith(store, recordings, [{ side: 'front', uri: 'front2.jpg' }]);

    expect(wire(store)).toMatchObject({ documentFrontVideo: 'med_video_front-take-2.mp4' });
  });

  it('a slow upload of a replaced capture never lands beside the new photo', async () => {
    jest.useFakeTimers();
    try {
      const store = makeStore();
      const recordings = emptySideRecordings();
      recordCapture(recordings, 'front', 'front-take-1.mp4');
      let landOld: (id: string) => void = () => undefined;
      const first = continueWith(store, recordings, [{ side: 'front', uri: 'front1.jpg' }], () =>
        new Promise((resolve) => {
          landOld = resolve;
        }),
      );
      // Continue stops waiting for the clip; its upload carries on.
      await jest.advanceTimersByTimeAsync(60);
      await first;

      // Retaken from the gallery before the old clip finished uploading.
      dropCapture(recordings, 'front');
      recordCapture(recordings, 'front', null);
      await continueWith(store, recordings, [{ side: 'front', uri: 'front2.jpg' }]);

      landOld('med_video_front-take-1');
      await jest.advanceTimersByTimeAsync(0);

      expect(store.getState().mediaIds.documentFrontVideo).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a one-sided ID does not carry the back of a two-sided ID picked earlier', async () => {
    const store = makeStore();
    const recordings = emptySideRecordings();
    recordCapture(recordings, 'front', 'card-front.mp4');
    recordCapture(recordings, 'back', 'card-back.mp4');
    await continueWith(store, recordings, [
      { side: 'front', uri: 'card-front.jpg' },
      { side: 'back', uri: 'card-back.jpg' },
    ]);
    expect(store.getState().mediaIds.documentBackVideo).toBe('med_video_card-back.mp4');

    // Back to the picker, a passport this time: the step mounts afresh.
    const passport = emptySideRecordings();
    recordCapture(passport, 'front', 'passport.mp4');
    await continueWith(store, passport, [{ side: 'front', uri: 'passport.jpg' }]);

    const ids = wire(store);
    expect(ids).toMatchObject({ documentFrontVideo: 'med_video_passport.mp4' });
    expect(ids).not.toHaveProperty('documentBack');
    expect(ids).not.toHaveProperty('documentBackVideo');
  });

  it('leaves the selfie and every other upload alone', async () => {
    const store = makeStore();
    store.getState().setMediaId('selfie', 'med_selfie');
    store.getState().setMediaId('livenessVideo', 'med_liveness');
    const recordings = emptySideRecordings();
    recordCapture(recordings, 'front', null);
    await continueWith(store, recordings, [{ side: 'front', uri: 'front.jpg' }]);
    expect(store.getState().mediaIds).toMatchObject({ selfie: 'med_selfie', livenessVideo: 'med_liveness' });
    expect(DOCUMENT_MEDIA_KEYS).not.toContain('selfie');
  });
});

describe('the capture step pairs each still with its recording', () => {
  const src = readFileSync(join(__dirname, '..', 'screens', 'DocumentCaptureStep.tsx'), 'utf8');

  it('uploads through uploadDocumentSides and never sets a recording id itself', () => {
    expect(src).toContain('uploadDocumentSides(');
    expect(src).not.toMatch(/setMediaId\('document(Front|Back)Video'/);
  });

  it('records a gallery photo as a capture with no recording', () => {
    expect(src).toContain("recordCapture(recordingsRef.current, side, source === 'camera' ? videoPath : null)");
  });

  it('makes a retake drop the side capture', () => {
    expect(src).toMatch(/const retake = [\s\S]*?dropCapture\(recordingsRef\.current, side\)/);
  });
});
