import { useRef } from 'react';
import type { CameraVideoOutput } from 'react-native-vision-camera';

import { MAX_VIDEO_DURATION_MS } from '../config/captureSettings';
import { createVideoRecorder, type RecorderSource, type VideoRecorderHandle } from './videoRecorderCore';

// Shared best-effort video recorder for the VisionCamera v5 output model, used by
// both the liveness selfie video and the document-capture videos. Mirrors the
// Flutter SDK's "record while the camera is live, stop when the still is taken,
// upload best-effort" pattern.
//
// Three robustness concerns are handled here:
//  • The video output connects to the camera session a moment after mount, so the
//    first start can throw "VideoOutput is not yet connected" — we retry briefly.
//  • The finished file path arrives via the `onRecordingFinished` callback (not the
//    stopRecording promise), so we bridge the two and bound the wait. Each start
//    is its own take, so a path that arrives late reaches only its own take
//    (videoRecorderCore.ts).
//  • A hard duration cap (MAX_VIDEO_DURATION_MS) auto-stops the recording so a long
//    camera session can't bloat the file past the upload ceiling.

export type { VideoRecorderHandle } from './videoRecorderCore';

export function useVideoRecorder(videoOutput: CameraVideoOutput, enabled: boolean): VideoRecorderHandle {
  // The latest output and switch, read when a take starts.
  const outputRef = useRef(videoOutput);
  outputRef.current = videoOutput;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const recorderRef = useRef<VideoRecorderHandle | null>(null);
  if (!recorderRef.current) {
    recorderRef.current = createVideoRecorder(
      () => outputRef.current as unknown as RecorderSource,
      () => enabledRef.current,
      { maxDurationMs: MAX_VIDEO_DURATION_MS },
    );
  }
  // A fresh handle each render, as before: callers that list it in an effect's
  // deps (LivenessStep) retry start() on every render, which is how a recorder
  // that was not yet enabled on the first render still starts.
  return { ...recorderRef.current };
}
