import { useCallback, useRef, useState } from 'react';
import type { CameraRef } from 'react-native-vision-camera';

/**
 * Torch for the document camera — a document under glass or in a dim room is
 * the commonest reason a capture reads badly, and it is the one thing the user
 * can fix instantly. Split out of CameraViewfinder for the 200-line rule.
 *
 * IMPERATIVE, verified toggling — not the declarative `torchMode` prop.
 * The prop path fires the controller call and drops the promise, so a
 * rejection (CameraX refuses enableTorch when the bound camera reports no
 * flash unit) leaves the button lit and the scene dark, with nothing in any
 * log. Await the call, read the REAL state back off the controller (its
 * getter reads CameraX TorchState, unlike the device object, whose
 * `hasTorch` is a hardcoded stub for physical devices in this VisionCamera
 * version), and keep UI state honest either way.
 */
export function useTorch(): {
  torch: boolean;
  cameraRef: React.RefObject<CameraRef | null>;
  toggleTorch: () => Promise<void>;
} {
  const [torch, setTorch] = useState(false);
  const cameraRef = useRef<CameraRef>(null);

  const toggleTorch = useCallback(async () => {
    const controller = cameraRef.current?.controller;
    if (!controller) return;
    const next = !torch;
    try {
      await controller.setTorchMode(next ? 'on' : 'off');
      const actual = controller.torchMode === 'on';
      setTorch(actual);
      if (actual !== next && __DEV__) {
        console.warn('[kyc.camera] torch state did not follow the request');
      }
    } catch (err) {
      if (__DEV__) console.warn('[kyc.camera] torch toggle failed:', err);
      setTorch(false);
    }
  }, [torch]);

  return { torch, cameraRef, toggleTorch };
}
