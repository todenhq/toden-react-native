import { useEffect, useState } from 'react';

import { tapHaptic } from '../../services/haptics';
import { MIN_RECORDED_MS } from '../../lib/documentRecordings';

// ---------------------------------------------------------------------------
// "Now turn it over."
//
// With the review screen off, nothing stands between the front's shutter and the
// back's camera: the person is still holding the front up, auto-capture sees a
// sharp card and shoots it a second time. So the camera waits here for a
// moment, with the shutter held.
//
// The turn-over plays IN the camera's frame (as on web, 2026-11-18): the camera
// keeps running, the sample already in the frame turns over where it stands
// (DocumentGhost `turnFrom`), the hint line says to turn the card, and the
// shutter gives that as its reason. A separate card turning over a dimmed
// camera, with the hint and the controls gone until it ended, read as the
// camera stopping and starting again.
//
// The wait is the fix as much as the words are. It runs out by itself so the
// person never has to reach for the screen with their hands full. There is no
// button to cut it short: it moves on by itself, as on the web and Flutter
// SDKs.
// ---------------------------------------------------------------------------

/** Time to read this, turn the document over and bring it back into frame (the web's FLIP_UNTAPPED_MS). */
export const TURN_OVER_MS = 5000;

/**
 * True while the camera should wait. Starts again each time `needed` turns on.
 * `recordingLeadIn` turns true for the last MIN_RECORDED_MS of the wait: the
 * back's clip starts there, so it is already long enough to be checked when the
 * wait ends, without recording the front through the whole of it
 * (viewfinder/documentClip.ts).
 */
export function useTurnOverHold(needed: boolean): { turning: boolean; recordingLeadIn: boolean } {
  const [turning, setTurning] = useState(needed);
  const [recordingLeadIn, setRecordingLeadIn] = useState(false);
  // Follow `needed` in the same render it changes, not an effect later: the
  // render where the back's camera appears must already be waiting, or the
  // back's clip and auto-capture start for one render with the front still up.
  const [lastNeeded, setLastNeeded] = useState(needed);
  if (needed !== lastNeeded) {
    setLastNeeded(needed);
    setTurning(needed);
  }
  useEffect(() => {
    setTurning(needed);
    setRecordingLeadIn(false);
    if (!needed) return undefined;
    tapHaptic();
    const lead = setTimeout(() => setRecordingLeadIn(true), Math.max(0, TURN_OVER_MS - MIN_RECORDED_MS));
    const t = setTimeout(() => setTurning(false), TURN_OVER_MS);
    return () => {
      clearTimeout(lead);
      clearTimeout(t);
    };
  }, [needed]);
  return { turning, recordingLeadIn: turning && recordingLeadIn };
}
