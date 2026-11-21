// ---------------------------------------------------------------------------
// The ready pause: once the face is in place, a beat of "Hold still" before
// the first gesture is asked for, so the person has settled and is listening
// when it comes, rather than hearing it the instant they got into the window.
// Timed, not counted in frames, so a slow phone pauses as long. Moving out of
// place starts it again (the caller clears `readyAt`). Pure.
//
// The web SDK's liveness/ready-pause.ts, number for number. (The web also
// fills the positioning part of its ring through the pause; this SDK's ring
// leaves positioning empty, so it has no use for that share.)
// ---------------------------------------------------------------------------

export const READY_PAUSE_MS = 1500;

export interface ReadyStep {
  /** When the face first held in place, on the caller's clock; null to start over. */
  readyAt: number | null;
  /** Whether to ask for the first gesture now. */
  go: boolean;
}

/** One frame of a face held in place: start the pause, keep it, or end it. */
export function readyPauseStep(readyAt: number | null, now: number): ReadyStep {
  if (readyAt === null) return { readyAt: now, go: false };
  if (now - readyAt < READY_PAUSE_MS) return { readyAt, go: false };
  return { readyAt: null, go: true };
}
