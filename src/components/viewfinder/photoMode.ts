// ---------------------------------------------------------------------------
// Photo mode: the full-screen document camera's look without the scan.
//
// The decisions PhotoCamera and PhotoViewfinder make, kept free of React
// Native so they can be tested on their own. Photo mode has no auto-capture,
// no corner, framing or text gate and no live instruction: the shutter is
// always enabled and takes the photo as it is.
// ---------------------------------------------------------------------------

/**
 * Photo mode's own words. Hard-coded beside the scan's camera captions
 * (ImmersiveBottomBar's "Upload", "Light"): a catalogue key would have to be
 * added to the shared customisable-texts contract, which every SDK must match.
 */
export const PHOTO_COPY = {
  /** The upload button's screen-reader hint: the photo may not be of a document. */
  uploadHint: 'Choose a photo instead of using the camera.',
  /** The instruction for a document photo. */
  fitDocument: 'Fit the whole document in view',
  /** The entrance photo's title and instruction. */
  entranceTitle: 'Entrance photo',
  fitEntrance: 'Fit the door and the house number in the frame',
} as const;

/**
 * A photo off the in-SDK camera, in the shape `launchCameraAsync` handed back
 * (an `ImagePickerAsset`'s uri, mimeType, fileSize and fileName), so a caller's
 * existing shrink-then-size-check path (preparePickedPhoto) takes it unchanged.
 */
export interface CapturedPhoto {
  uri: string;
  mimeType: string;
  /** Size in bytes, or null when it could not be read. */
  fileSize: number | null;
  fileName: string;
}

/** VisionCamera answers a filesystem path; image tools want a file:// URI. */
export function photoFileUri(filePath: string): string {
  return filePath.startsWith('file://') ? filePath : `file://${filePath}`;
}

/** The photo's type, from the extension the camera wrote. */
export function photoMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
}

/** The file's own name, the last part of its path. */
export function photoFileName(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  return name || 'photo.jpg';
}

/**
 * What photo mode hands BottomBar for the shutter: nothing ever holds it.
 * No gate (blockedHint), no dwell ring (progress), never shown busy, always
 * ready. A second tap while a capture is in flight is dropped by the
 * viewfinder's own guard, not by disabling the button.
 */
export const PHOTO_SHUTTER = {
  ready: true,
  busy: false,
  progress: 0,
  blockedHint: null,
} as const;

/** True when the shutter would be drawn disabled (BottomBar's own rule). */
export function shutterDisabled(s: { ready: boolean; busy: boolean; blockedHint: string | null }): boolean {
  return s.busy || !(s.ready && !s.blockedHint);
}

/** What is drawn over the preview besides the top bar and the bottom row. */
export interface PhotoOverlayParts {
  /** The caller's optional instruction, shown as a neutral pill. */
  hint: string | null;
  /** A plain frame of this aspect, only when the caller asked for one. */
  guideAspect: number | null;
}

export function photoOverlayParts(p: { instruction?: string | null; guideAspect?: number | null }): PhotoOverlayParts {
  const hint = p.instruction?.trim() || null;
  const guideAspect = typeof p.guideAspect === 'number' && p.guideAspect > 0 ? p.guideAspect : null;
  return { hint, guideAspect };
}

/**
 * Leaving the camera, then doing something once it has gone.
 *
 * On iOS a screen (the photo library, the source sheet) cannot open while the
 * camera's own full-screen modal is still sliding away, and the flow cannot be
 * closed cleanly from inside it either. So the follow-up is parked and run from
 * the modal's onDismiss, the same pattern MediaSourceSheet uses. Android has no
 * such conflict, so it runs straight away.
 */
export interface ExitQueue {
  /** Hide the camera, then run `then` (now, or once dismissed). */
  leave: (hide: () => void, then?: (() => void) | null) => void;
  /** The modal has finished dismissing: run what was parked. */
  dismissed: () => void;
}

export function createExitQueue(deferUntilDismissed: boolean): ExitQueue {
  let pending: (() => void) | null = null;
  return {
    leave(hide, then) {
      if (deferUntilDismissed) {
        pending = then ?? null;
        hide();
        return;
      }
      hide();
      then?.();
    },
    dismissed() {
      const run = pending;
      pending = null;
      run?.();
    },
  };
}
