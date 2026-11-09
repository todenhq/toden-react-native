// Recovery from a submit refused over contact proofs. Mirrors the web SDK's
// steps/contact-recovery.ts — keep the two in lockstep.
//
// Contact proof tokens are SINGLE-USE and expire ~30 minutes after the OTP is
// checked, but they ride session progress and are restored on resume. A
// resumed attempt therefore carries a proof the server will (rightly)
// validate-and-drop at submit, while the contact step still shows "verified"
// — and a plain retry resubmits the same dead token forever.
//
// The 422 is recoverable in-flow: clear the stale proofs, walk the person
// back to the contact step (their data is untouched), and once re-verified
// the step routes straight back to 'submitted', which auto-submits with the
// fresh token.
import { VerificationApiError } from '../services/api';
import type { VerificationStep } from '../types/config';

export type ContactChannel = 'email' | 'phone';

/** The channels a 422 `contact_verification_required` names as missing. */
export function expiredContactChannels(err: unknown): ContactChannel[] {
  if (!(err instanceof VerificationApiError) || err.code !== 'contact_verification_required') return [];
  const missing = Array.isArray(err.body?.missing) ? (err.body.missing as unknown[]) : [];
  return missing.filter((c): c is ContactChannel => c === 'email' || c === 'phone');
}

export function contactStepFor(channel: ContactChannel): VerificationStep {
  return channel === 'email' ? 'email-verification' : 'phone-verification';
}

/**
 * Where the step routes once this channel is verified. Normally the ordinary
 * forward step; in recovery it returns to 'submitted' (which auto-submits
 * with the fresh proof) via any OTHER still-refused channel first — the
 * person never re-walks steps they already completed.
 */
export function stepAfterContactVerified(opts: {
  recovery: boolean;
  expired: ContactChannel[];
  channel: ContactChannel;
}): VerificationStep | null {
  if (!opts.recovery) return null;
  const remaining = opts.expired.find((c) => c !== opts.channel);
  return remaining ? contactStepFor(remaining) : 'submitted';
}

/**
 * Whether the contact step hides Back: while it is recovering from a refused
 * submission (its channel is among the expired ones), which returns to the
 * end of the flow rather than walking back through it. Otherwise Back is the
 * step order's (config/stepOrder.ts): phone into email when the flow has an
 * email check, else consent; email into consent; none on a consent-less
 * flow's opening step. Mirrors the web SDK's ContactVerificationStep.
 */
export function contactBackHidden(step: VerificationStep, expired: readonly ContactChannel[] | undefined): boolean {
  if (step === 'email-verification') return (expired ?? []).includes('email');
  if (step === 'phone-verification') return (expired ?? []).includes('phone');
  return false;
}
