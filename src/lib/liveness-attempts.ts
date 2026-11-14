// ─── A limit on liveness attempts ────────────────────────────────────────────
//
// A workflow may set `maxLivenessAttempts` (1 to 3, or `false` for no limit;
// left out it is 3, on by default, as the server reads it). The check runs on the
// phone, so the server only learns of a failure when the SDK reports it:
// POST /liveness/failed, once per failed check, never retried. The server
// counts failures on the attempt and answers with what is left; at the limit
// it declines the session (409 session_declined, reason
// liveness_attempts_exceeded), which the flow shows on its declined screen.
//
// Pure, so the wording and the response reading are tested without a camera.
// Mirrors the web and Flutter SDKs.

import type { LivenessFailureReason } from '../liveness/types';

/** The reason the server gives when the face check's attempts ran out. */
export const LIVENESS_ATTEMPTS_EXCEEDED = 'liveness_attempts_exceeded';

/** What /liveness/failed answered, read defensively. */
export type LivenessFailedResult =
  /** No limit applies (no session, or the workflow sets none). */
  | { limited: false }
  /** Counted. `attemptsLeft` is 0 only when the decline lost a race. */
  | { limited: true; attemptsLeft: number };

/** The default limit, for a workflow that leaves the setting out. */
export const DEFAULT_LIVENESS_ATTEMPTS = 3;

/**
 * The configured limit, or null when the workflow turns it off (`false`). Left
 * out, or unreadable, it is the default of 3: the server decides in the end,
 * so reporting a failure it does not count costs one request and changes
 * nothing.
 */
export function livenessAttemptLimit(value: unknown): number | null {
  if (value === false) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return Math.min(value, DEFAULT_LIVENESS_ATTEMPTS);
  return DEFAULT_LIVENESS_ATTEMPTS;
}

/**
 * Whether a failure is a failed CHECK, the only kind the server counts. A
 * camera that never started (`no_camera`, `load_error`) is not the person
 * failing the check; permission and upload errors never reach `failed`.
 */
export function countsAsFailedCheck(reason: LivenessFailureReason | null): boolean {
  return reason === 'timeout' || reason === 'face_lost' || reason === 'face_swap' || reason === 'flash_failed';
}

/** Read the 200 answer; anything unexpected reads as "no limit". */
export function readLivenessFailed(body: unknown): LivenessFailedResult {
  if (body === null || typeof body !== 'object') return { limited: false };
  const { limited, attemptsLeft } = body as { limited?: unknown; attemptsLeft?: unknown };
  if (limited !== true) return { limited: false };
  const left = typeof attemptsLeft === 'number' && Number.isFinite(attemptsLeft) ? Math.max(0, Math.floor(attemptsLeft)) : 0;
  return { limited: true, attemptsLeft: left };
}

/**
 * The second line under the failure message: "1 attempt left." or
 * "2 attempts left.". Null when nothing should be said (no limit, or none left).
 * UK English, no em dashes.
 */
export function attemptsLeftLine(result: LivenessFailedResult | null): string | null {
  if (!result || !result.limited || result.attemptsLeft < 1) return null;
  const n = result.attemptsLeft;
  return n === 1 ? '1 attempt left.' : `${n} attempts left.`;
}
