import { useMemo } from 'react';
import { useCameraDevice, useCameraDevices, type CameraDevice } from 'react-native-vision-camera';

/**
 * The back camera the document camera and the photo camera both use.
 *
 * Prefers a back camera that CAN torch, then falls back to the library's
 * default ranking. On multi-camera phones (seen live on a Galaxy S24) the
 * default pick can land on a flashless back device (CameraX then rejects
 * enableTorch with "No flash unit") while a flash-capable back camera sits
 * right next to it in the list. `hasTorch` is trustworthy on the logical
 * device objects (it reads CameraX's hasFlashUnit()); only the physical-device
 * wrappers stub it, and those lose this find() either way.
 */
export function useBackCamera(): CameraDevice | undefined {
  const allDevices = useCameraDevices();
  const defaultBack = useCameraDevice('back');
  return useMemo(
    () => allDevices.find((d) => d.position === 'back' && d.hasTorch) ?? defaultBack,
    [allDevices, defaultBack],
  );
}
