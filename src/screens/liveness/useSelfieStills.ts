import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

import { compressSelfieImage, cutSelfie } from '../../services/mediaCompress';
import { stillFace } from '../../lib/selfie-pick';
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
// ---------------------------------------------------------------------------

export function useSelfieStills(
  photoOutput: CameraPhotoOutput,
  land: (shot: SelfieShot, uri: string | null, face: ReturnType<typeof stillFace>) => void,
): {
  takeRunStill: (face: LivenessFaceData, shot: SelfieShot) => void;
  finalSelfie: (choice: SelfieChoice) => Promise<string>;
} {
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const landRef = useRef(land);
  landRef.current = land;

  const takeRunStill = useCallback(
    (face: LivenessFaceData, shot: SelfieShot) => {
      const run = photoOutput
        .capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {})
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
    async (choice: SelfieChoice): Promise<string> => {
      let raw: string;
      let face: ReturnType<typeof stillFace>;
      if (choice.source === 'best') {
        raw = choice.selfie.uri;
        face = choice.selfie.face;
      } else {
        await inFlightRef.current?.catch(() => undefined);
        const file = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
        raw = `file://${file.filePath}`;
        face = stillFace(choice.face, Platform.OS);
      }
      // The standard frame; the whole still, compressed, if it cannot be cut.
      const cut = await cutSelfie(raw, face).catch(() => null);
      return cut ?? (await compressSelfieImage(raw).catch(() => raw));
    },
    [photoOutput],
  );

  return { takeRunStill, finalSelfie };
}
