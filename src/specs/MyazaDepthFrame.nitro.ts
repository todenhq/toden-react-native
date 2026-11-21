import type { HybridObject } from 'react-native-nitro-modules';
import type { CameraPhotoOutput } from 'react-native-vision-camera';

// ---------------------------------------------------------------------------
// Nitro spec for the iPhone depth frame (Core: docbio/depth-sensor.ts).
//
// The selfie's still carries one depth map from the front TrueDepth (Face ID)
// camera, embedded in the photo file by the capture itself. This module does
// the two things VisionCamera 5 cannot:
//
// - It switches depth delivery on for the photo output. VisionCamera passes a
//   capture's `enableDepthData` through to the photo's settings but never turns
//   on `AVCapturePhotoOutput.isDepthDataDeliveryEnabled`, and AVFoundation
//   raises an Objective-C exception (a crash Swift cannot catch) when a capture
//   asks for depth the output was not prepared for. So a capture may only ask
//   once `photoDepthReady` says yes.
// - It reads the depth map back out of the photo file and writes it as a
//   16-bit greyscale PNG of millimetres, the form Core decodes.
//
// iOS only: Android and phones without a TrueDepth camera send no depth frame.
// "Nothing" is an EMPTY STRING rather than a nullable, as in MyazaDeviceIntel.
// ---------------------------------------------------------------------------

export interface MyazaDepthFrame extends HybridObject<{ ios: 'swift' }> {
  /**
   * Turns depth delivery on for `output`, when its camera can deliver depth
   * with photos in the session's current configuration. Call it once the
   * session is running (before that the output cannot tell): the change
   * rebuilds the capture pipeline, so it belongs before the liveness
   * recording starts. True when depth delivery is on.
   */
  enablePhotoDepth(output: CameraPhotoOutput): boolean;

  /**
   * Whether a capture on `output` may ask for depth right now. Asked before
   * every capture: a session reconfigured since `enablePhotoDepth` can switch
   * depth delivery off again, and asking then would crash.
   */
  photoDepthReady(output: CameraPhotoOutput): boolean;

  /**
   * Reads the depth map embedded in the photo at `photoPath` (a path or a
   * file:// URL), turned upright like the photo, and writes it to a temporary
   * file as a 16-bit greyscale PNG whose values are millimetres from the
   * camera (0 where there is no reading). Resolves the PNG's path, or an empty
   * string when the photo has no absolute depth map. Never rejects.
   */
  depthPngFromPhoto(photoPath: string): Promise<string>;
}
