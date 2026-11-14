// ─── A declined session ──────────────────────────────────────────────────────
//
// The server can decline a session before it is submitted. Two rules do it:
// an email or phone step with `declineOnLastAttempt` turned on, where the
// applicant used up a code's attempts (/contact/check answers `409 { error:
// 'session_declined', reasonCode: 'contact_attempts_exceeded', message }`),
// and a workflow's `maxLivenessAttempts`, where the last failed face check is
// reported (/liveness/failed answers the same with
// 'liveness_attempts_exceeded'). From then on every request naming the session
// (session start and resume, a progress save, /verify, an upload) answers the
// same.
//
// Exactly parallel to a cancelled session (lib/session-cancelled.ts): retrying
// can never succeed, so the SDK stops on a terminal screen with Close, never
// on a "something went wrong, try again" one. Pure so every call site reads
// the refusal the same way.

import type { VerificationStep } from '../types/config';
import { LIVENESS_ATTEMPTS_EXCEEDED } from './liveness-attempts';

export const SESSION_DECLINED_CODE = 'session_declined';

/** The reason the server gives when a code's attempts ran out. */
export const CONTACT_ATTEMPTS_EXCEEDED = 'contact_attempts_exceeded';

/** Which contact step the decline came from, when the SDK knows. */
export type DeclinedChannel = 'email' | 'phone';

/** What the store keeps about a declined session. */
export interface DeclinedSession {
  /** The server's own sentence, or null when it sent none. */
  message: string | null;
  reasonCode: string | null;
  channel: DeclinedChannel | null;
}

/** UK English, no em dashes. */
export const DECLINED_TITLES = {
  email: "We couldn't verify your email address",
  phone: "We couldn't verify your phone number",
  face: "We couldn't verify your face",
  unknown: 'This verification has ended',
} as const;

/** The body when a code's attempts ran out and the server sent no sentence. */
export const DEFAULT_CONTACT_DECLINED_MESSAGE =
  'The code was entered incorrectly too many times, so this verification has ended. Contact the organisation that sent it if you need help.';

/** The body when the face check's attempts ran out and the server sent no sentence. */
export const DEFAULT_LIVENESS_DECLINED_MESSAGE =
  'The face check did not succeed in the attempts allowed, so this verification has ended. Contact the organisation that sent it if you need help.';

/** The body for any other decline the server sent no sentence for. */
export const DEFAULT_DECLINED_MESSAGE =
  'This verification has ended. Contact the organisation that sent it if you need help.';

/**
 * The decline an API failure carries, or null when it is anything else. Read
 * off the server's own code, never the status alone (a 409 also means other
 * things), and structurally, so it never depends on which copy of the error
 * class a caller holds.
 */
export function declinedRefusalOf(err: unknown): { message: string | null; reasonCode: string | null } | null {
  if (err === null || typeof err !== 'object') return null;
  const { code, body } = err as { code?: unknown; body?: { message?: unknown; reasonCode?: unknown } | null };
  if (code !== SESSION_DECLINED_CODE) return null;
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;
  const reasonCode =
    typeof body?.reasonCode === 'string' && body.reasonCode.trim() ? body.reasonCode.trim() : null;
  return { message, reasonCode };
}

/** The contact channel a step asks for, or null for every other step. */
export function declinedChannelForStep(step: VerificationStep): DeclinedChannel | null {
  if (step === 'email-verification') return 'email';
  if (step === 'phone-verification') return 'phone';
  return null;
}

/**
 * The declined screen's words. A used-up code names the channel it was for
 * when the SDK knows it; a used-up face check says it was the face. The body
 * is the server's sentence when it sent one.
 */
export function declinedScreenCopy(declined: DeclinedSession): { title: string; body: string } {
  if (declined.reasonCode === LIVENESS_ATTEMPTS_EXCEEDED) {
    return { title: DECLINED_TITLES.face, body: declined.message ?? DEFAULT_LIVENESS_DECLINED_MESSAGE };
  }
  const contact = declined.reasonCode === CONTACT_ATTEMPTS_EXCEEDED;
  const title = contact && declined.channel ? DECLINED_TITLES[declined.channel] : DECLINED_TITLES.unknown;
  const fallback = contact ? DEFAULT_CONTACT_DECLINED_MESSAGE : DEFAULT_DECLINED_MESSAGE;
  return { title, body: declined.message ?? fallback };
}
