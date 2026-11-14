import { VerificationApiError } from './api';

// ---------------------------------------------------------------------------
// User-facing copy for the contact-verification send/check failures.
//
// Each message says what happened AND what to do next, because every one of
// these is recoverable and the user is mid-flow. A bare "something went wrong"
// on an expired code leaves them retyping the same dead digits.
// ---------------------------------------------------------------------------

const CHECK_ERRORS: Record<string, string> = {
  invalid_code: 'That code is not correct. Please try again.',
  challenge_expired: 'This code has expired. Request a new one.',
  too_many_attempts: 'Too many incorrect attempts. Request a new code.',
  challenge_not_found: 'This code is no longer valid. Request a new one.',
};

const SEND_ERRORS: Record<string, string> = {
  invalid_destination: 'That does not look valid. Please check and try again.',
  send_rate_limited: 'Too many codes requested. Please wait a while and try again.',
  send_failed: 'We could not send the code. Please try again.',
};

function describe(err: unknown, map: Record<string, string>): string {
  if (err instanceof VerificationApiError && err.code && map[err.code]) return map[err.code]!;
  if (err instanceof TypeError) return 'Network error. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * A workflow that takes work addresses only refuses a free-provider one with
 * `invalid_destination` and this reason; an older server sends no reason.
 */
const CORPORATE_EMAIL_REQUIRED =
  'Use your work email address. Personal email services such as Gmail are not accepted here.';

export const describeSendError = (err: unknown): string =>
  err instanceof VerificationApiError &&
  err.code === 'invalid_destination' &&
  err.body?.reason === 'corporate_email_required'
    ? CORPORATE_EMAIL_REQUIRED
    : describe(err, SEND_ERRORS);
export const describeCheckError = (err: unknown): string => describe(err, CHECK_ERRORS);

/**
 * Attempts left after a wrong code, when the server reports it.
 *
 * Showing the count is what stops a user burning the whole budget guessing —
 * absent it they have no signal that the code is about to die.
 */
export function attemptsRemaining(err: unknown): number | undefined {
  if (!(err instanceof VerificationApiError)) return undefined;
  const value = err.body?.attemptsRemaining;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Is the code the check was for used up? Either the wrong guess spent its
 * last attempt (`invalid_code` with `attemptsRemaining: 0`), or a check on an
 * already used-up code was refused (`too_many_attempts`). No further guess on
 * it can succeed, so the field is disabled until a new code is sent.
 */
export function isCodeUsedUp(err: unknown): boolean {
  if (!(err instanceof VerificationApiError)) return false;
  if (err.code === 'too_many_attempts') return true;
  return err.code === 'invalid_code' && attemptsRemaining(err) === 0;
}

/** The message a used-up code shows, whichever signal said so. */
export const CODE_USED_UP_MESSAGE = CHECK_ERRORS.too_many_attempts!;
