// Is the light good enough for liveness? Judged on the FACE, not the frame.
//
// The native detector's `brightness` averages the whole frame, so a well-lit
// face in front of a dark wall or a dark room read as "too dark" and the person
// was told to move somewhere brighter when nothing was wrong with how they were
// lit. With a face in view this reads the centre patch the detector already
// measures for the flash check (`faceRgb`: the centre 40% x 50% where the
// positioning gate holds the face). With no face, the whole frame still
// decides: a room too dark to find a face in is when the warning matters.
//
// Mirrors the web SDK's lib/light-level.ts thresholds. PURE.
import type { LivenessFaceData } from './types';

export const LIGHT_THRESHOLDS = {
  frame: { dark: 62, bright: 200 },
  face: { dark: 45, bright: 215 },
} as const;

export type Lighting = 'dark' | 'bright' | null;

/** ITU-R BT.601 luminance of the face patch, or null when it was not sampled. */
export function faceLuma(rgb: LivenessFaceData['faceRgb']): number | null {
  if (!rgb || rgb.some((c) => !Number.isFinite(c) || c < 0)) return null;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

/** The lighting one reading says: the face patch with a face in view, else the frame. */
export function lightingOf(data: Pick<LivenessFaceData, 'brightness' | 'faceCount' | 'faceRgb'>): Lighting {
  const face = data.faceCount > 0 ? faceLuma(data.faceRgb) : null;
  const lines = face !== null ? LIGHT_THRESHOLDS.face : LIGHT_THRESHOLDS.frame;
  const luma = face ?? data.brightness;
  if (luma < lines.dark) return 'dark';
  if (luma > lines.bright) return 'bright';
  return null;
}
