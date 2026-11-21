// ---------------------------------------------------------------------------
// Whether the person is responding to a gesture: doing anything with their
// face that an attempt at one would.
//
// The gesture narrator shows a gesture and then goes. It comes back only for
// someone who is not responding, so it has to tell a person who is trying
// (and should be left to it) from one who is waiting to be shown again. A
// gesture landing is not enough to go on: a nod takes a moment to land, and a
// person half way through one is plainly responding.
//
// A port of the web SDK's liveness/response-watch.ts. The web reads face mesh
// points; this SDK has the native detector's own signals, which are already
// independent of the distance from the camera, so the four measures are read
// straight off them: the head's yaw (a turn), its pitch (a nod), the smile
// probability (a smile) and how open the eyes are (a blink).
// ---------------------------------------------------------------------------

import type { LivenessFaceData } from './types';

/** How far each measure has to change to count as the person doing
 *  something: degrees of yaw, degrees of pitch, smile probability, eye-open
 *  probability. Well clear of the detectors' own jitter, well under a real
 *  attempt (a turn passes at 25 degrees, a nod at 10, a smile at 0.5, a blink
 *  under 0.2). */
const NOTICED = [6, 5, 0.2, 0.25];
/** How fast the resting face is re-learnt, per frame, from a person who is
 *  only drifting. */
const SETTLING = 0.05;

function measures(face: LivenessFaceData): number[] {
  return [
    face.headEulerAngleY,
    face.headEulerAngleX,
    face.smilingProbability,
    (face.leftEyeOpenProbability + face.rightEyeOpenProbability) / 2,
  ];
}

export class ResponseWatch {
  private resting: number[] | null = null;
  private last = 0;

  /** When the person last did something, on the clock `seen` was given; 0 for never. */
  get respondedAt(): number {
    return this.last;
  }

  /** One frame of the face, at `now`. */
  seen(face: LivenessFaceData, now: number): void {
    const next = measures(face);
    const resting = this.resting;
    if (!resting) {
      this.resting = next;
      return;
    }
    if (next.some((measure, k) => Math.abs(measure - resting[k]!) > NOTICED[k]!)) {
      this.last = now;
      // Where they are now is what the next move is measured from.
      this.resting = next;
      return;
    }
    for (let k = 0; k < resting.length; k++) resting[k]! += (next[k]! - resting[k]!) * SETTLING;
  }

  /** A new face, or a new attempt: nothing is known of it yet. */
  reset(): void {
    this.resting = null;
    this.last = 0;
  }
}
