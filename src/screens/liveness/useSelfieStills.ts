import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

import { capturePhotoWithDepth, depthFrameOf } from '../../liveness/depthFrame';
import { compressSelfieImage, cutSelfie, imageSize } from '../../services/mediaCompress';
import { stillFace } from '../../lib/selfie-pick';
import { faceShareBox, type SelfieScene } from '../../lib/selfie-review';
import type { SelfieShot } from '../../lib/selfie-candidates';
import type { SelfieChoice } from '../../liveness/livenessState';
import type { LivenessFaceData } from '../../liveness/types';

// ---------------------------------------------------------------------------
// The selfie's stills (lib/selfie-pick.ts, user decision 2026-11-07).
//
// During the gestures the machine asks for a SILENT still whenever a frame is
// the best selfie so far (no shutter sound, the camera keeps recording); the
// still goes back to the machine, which keeps the best of the run. At the
// final capture the selfie is either a still taken now (the live frame
// qualified) or the run's best, and either way it is cut to the standard
// frame. A still still landing when the final one is due is waited for, so
// the photo output is never asked for two at once.
//
// The whole still goes back too, with where the face sits in it: the review
// shows it as the camera did (lib/selfie-review.ts). It stays on the phone.
//
// On an iPhone with a Face ID camera every still carries a depth map
// (liveness/depthFrame.ts), since any of them may become the selfie; the
// selfie's own still gives the depth frame sent beside it.
// ---------------------------------------------------------------------------

export function useSelfieStills(
  photoOutput: CameraPhotoOutput,
  land: (shot: SelfieShot, uri: string | null, face: ReturnType<typeof stillFace>) => void,
): {
  takeRunStill: (face: LivenessFaceData, shot: SelfieShot) => void;
  finalSelfie: (
    choice: SelfieChoice,
  ) => Promise<{ uri: string; scene: SelfieScene | null; depthUri: string | null }>;
} {
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const landRef = useRef(land);
  landRef.current = land;

  const takeRunStill = useCallback(
    (face: LivenessFaceData, shot: SelfieShot) => {
      const run = capturePhotoWithDepth(photoOutput, { flashMode: 'off', enableShutterSound: false })
        .then((file) => landRef.current(shot, `file://${file.filePath}`, stillFace(face, Platform.OS)))
        .catch(() => landRef.current(shot, null, null));
      inFlightRef.current = run;
      void run.finally(() => {
        if (inFlightRef.current === run) inFlightRef.current = null;
      });
    },
    [photoOutput],
  );

  const finalSelfie = useCallback(
    async (choice: SelfieChoice): Promise<{ uri: string; scene: SelfieScene | null; depthUri: string | null }> => {
      let raw: string;
      let face: ReturnType<typeof stillFace>;
      if (choice.source === 'best') {
        raw = choice.selfie.uri;
        face = choice.selfie.face;
      } else {
        await inFlightRef.current?.catch(() => undefined);
        const file = await capturePhotoWithDepth(photoOutput, { flashMode: 'off' });
        raw = `file://${file.filePath}`;
        face = stillFace(choice.face, Platform.OS);
      }
      // Read from the whole still before it is cut (the cut is re-encoded and
      // carries no depth), alongside the cut rather than after it.
      const depth = depthFrameOf(raw);
      // The standard frame; the whole still, compressed, if it cannot be cut.
      const cut = await cutSelfie(raw, face).catch(() => null);
      const uri = cut ?? (await compressSelfieImage(raw).catch(() => raw));
      // The still it was cut from, for the review. Without a cut (no face
      // known) the selfie IS the whole still, and the review fills the screen.
      const size = cut && face ? await imageSize(raw).catch(() => null) : null;
      const scene: SelfieScene | null =
        cut && face && size
          ? { uri: raw, width: size.width, height: size.height, face: faceShareBox(face, size.width, size.height) }
          : null;
      return { uri, scene, depthUri: await depth };
    },
    [photoOutput],
  );

  return { takeRunStill, finalSelfie };
}
