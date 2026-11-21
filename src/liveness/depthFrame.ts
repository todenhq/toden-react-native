// ---------------------------------------------------------------------------
// The iPhone depth frame (Core: docbio/depth-sensor.ts, user 2026-11-19).
//
// On an iPhone with a Face ID camera the selfie's stills are taken with depth,
// and the depth map of the still the selfie was cut from is sent beside it as
// a 16-bit greyscale PNG of millimetres (upload type `liveness_depth`). Core
// measures how far the nose stands out of the face: a print or a screen is
// flat to a millimetre.
//
// Best-effort end to end: Android, the web, a phone without TrueDepth, a build
// without the SDK's native code, or any failure sends no depth frame, and the
// capture and the submission go ahead exactly as before.
// ---------------------------------------------------------------------------

import type { CameraPhotoOutput, CapturePhotoSettings, PhotoFile } from 'react-native-vision-camera';

import type { MyazaDepthFrame } from '../specs/MyazaDepthFrame.nitro';
import { tryRequire } from '../services/fingerprint-sources';
import { withDeadline } from '../services/device-intel/native';

interface NitroModulesApi {
  hasHybridObject(name: string): boolean;
  createHybridObject<T>(name: string): T;
}

let cached: MyazaDepthFrame | null = null;

/** Test seam: inject a fake native module (or null to reset). */
export function setDepthFrameNativeForTests(mod: MyazaDepthFrame | null): void {
  cached = mod;
}

// Lazy and guarded, as services/device-intel/native.ts: only iOS registers the
// module, and the plain-Node test runner has no Nitro at all.
function depthNative(): MyazaDepthFrame | null {
  if (cached) return cached;
  const nitro = tryRequire<{ NitroModules?: NitroModulesApi }>(() => require('react-native-nitro-modules'))
    ?.NitroModules;
  if (!nitro) return null;
  try {
    if (!nitro.hasHybridObject('MyazaDepthFrame')) return null;
    cached = nitro.createHybridObject<MyazaDepthFrame>('MyazaDepthFrame');
    return cached;
  } catch {
    return null;
  }
}

/**
 * PURE. The front camera that can see depth: on an iPhone with Face ID it is
 * a camera of its own (type `true-depth`), beside the plain front camera
 * VisionCamera picks by default. The same sensor gives the picture, so the
 * selfie and the video look as before. Undefined elsewhere, and the caller
 * keeps its usual front camera.
 */
export function depthSelfieCamera<D extends { position: string; type: string }>(
  devices: readonly D[],
  os: string,
): D | undefined {
  if (os !== 'ios') return undefined;
  return devices.find((d) => d.position === 'front' && d.type === 'true-depth');
}

/**
 * Turns depth delivery on for the selfie's photo output. Called when the
 * camera has started, which is before the liveness recording does: the switch
 * rebuilds the capture pipeline, and doing it then costs the preview a beat
 * rather than the recording a gap. Never throws.
 */
export function enablePhotoDepth(output: CameraPhotoOutput): boolean {
  try {
    return depthNative()?.enablePhotoDepth(output) ?? false;
  } catch {
    return false;
  }
}

function photoDepthReady(output: CameraPhotoOutput): boolean {
  try {
    return depthNative()?.photoDepthReady(output) ?? false;
  } catch {
    return false;
  }
}

/**
 * A still to a file, with depth embedded when the output can give it. A
 * capture is only ever asked for depth after the native side has confirmed
 * the output is ready for it (asking otherwise crashes the app), and a depth
 * capture that fails is taken again without depth: depth never costs a still.
 */
export async function capturePhotoWithDepth(
  output: CameraPhotoOutput,
  settings: CapturePhotoSettings,
): Promise<PhotoFile> {
  if (!photoDepthReady(output)) return output.capturePhotoToFile(settings, {});
  try {
    return await output.capturePhotoToFile({ ...settings, enableDepthData: true }, {});
  } catch {
    return output.capturePhotoToFile(settings, {});
  }
}

/** Reading the map out of the photo is a few tens of ms; this bound only guards a stuck call. */
export const DEPTH_FRAME_TIMEOUT_MS = 1500;

/**
 * The depth frame of the photo at `photoUri`, written as a PNG: its file://
 * URI, or null when the photo carries no depth (or anything fails). Never
 * throws and never takes longer than its bound.
 */
export async function depthFrameOf(
  photoUri: string,
  timeoutMs: number = DEPTH_FRAME_TIMEOUT_MS,
): Promise<string | null> {
  const native = depthNative();
  if (!native) return null;
  try {
    const path = await withDeadline(native.depthPngFromPhoto(photoUri), timeoutMs);
    if (!path) return null;
    return path.startsWith('file://') ? path : `file://${path}`;
  } catch {
    return null;
  }
}
