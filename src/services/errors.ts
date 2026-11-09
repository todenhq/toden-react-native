// ---------------------------------------------------------------------------
// mapToVerificationError — turn a raw network/API error into a typed VerificationError
//
// Used at every server call site (upload, verify) so the `onError` callback
// always receives a documented, typed `code`. Mirrors the web SDK's
// `lib/errors.ts` and the Flutter SDK's `verification_error_mapper.dart` so all
// platforms surface the same codes.
// ---------------------------------------------------------------------------

import { VerificationApiError } from './api';
import { VerificationError, type VerificationErrorCode } from '../types/verification';
import { cancelledRefusalOf } from '../lib/session-cancelled';
import { BUSINESS_DOCUMENT_LABELS } from '../config/businessSteps';
import { businessDocumentGroupTitle } from '../config/businessDocumentGroups';
import type { BusinessDocumentKey } from '../types/business';

/** Which operation failed — picks the fallback code for non-HTTP failures. */
export type ErrorContext = 'upload' | 'verify';

/**
 * Invokes the consumer's `onError` handler defensively — a handler that throws
 * must never crash the SDK flow. Swallows the throw and warns instead.
 */
export function safeReportError(
  onError: ((error: VerificationError) => void) | undefined,
  error: VerificationError,
): void {
  if (!onError) return;
  try {
    onError(error);
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[Verification] onError handler threw and was ignored:', err);
    }
  }
}

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * Maps an unknown error thrown by the API client to a typed {@link VerificationError}
 * with a user-facing message. `context` selects the fallback code when the
 * failure isn't a specific HTTP status (a bare network failure during an upload
 * becomes `upload_failed`, during verify becomes `network_error`).
 */
export function mapToVerificationError(err: unknown, context: ErrorContext): VerificationError {
  if (err instanceof VerificationApiError) {
    // A cancelled session is terminal until an admin uncancels it, so it gets
    // its own code rather than a generic "try again" one.
    const cancelled = cancelledRefusalOf(err);
    if (cancelled) return new VerificationError('session_cancelled', cancelled.message);
    if (err.statusCode === 401) {
      return new VerificationError('invalid_api_key', 'Invalid API key. Please contact support.');
    }
    if (err.statusCode === 402) {
      const body = err.body ?? {};
      const required = toNum(body.required);
      const balance = toNum(body.balance);
      const currency = typeof body.currency === 'string' ? body.currency : undefined;
      const message =
        required !== undefined && balance !== undefined
          ? `Insufficient credits. Required: $${required.toFixed(2)}, Available: $${balance.toFixed(2)}`
          : 'Insufficient credits to process this verification.';
      return new VerificationError('insufficient_credits', message, { required, balance, currency });
    }
    if (err.statusCode === 403) {
      const feature = typeof err.body?.feature === 'string' ? err.body.feature : null;
      const message =
        err.code === 'id_type_not_allowed'
          ? "This ID type isn't enabled for your organization. Contact your administrator to request access."
          : feature === 'document_verification'
            ? 'Document verification is currently disabled for your organization.'
            : feature === 'gov_db_check'
              ? 'Government database verification is currently disabled for your organization.'
              : err.message || 'This verification feature is currently disabled for your organization.';
      return new VerificationError('feature_disabled', message);
    }
    // Nothing came back at all — DNS, routing, a refused connection. Kept
    // SEPARATE from a 5xx: telling somebody the server errored when their
    // request never arrived sends them looking through server logs for a
    // request that was never made.
    if (err.statusCode === 0) {
      const code: VerificationErrorCode = context === 'upload' ? 'upload_failed' : 'network_error';
      return new VerificationError(code, "Couldn't reach the server. Check your connection and try again.");
    }
    if (err.statusCode >= 500) {
      // Transient server error that survived retries — the request DID arrive.
      const code: VerificationErrorCode = context === 'upload' ? 'upload_failed' : 'network_error';
      return new VerificationError(code, 'A server error occurred. Please try again in a moment.');
    }
    // The reference names a record of the other type (a business flow naming
    // a person, or the reverse): a configuration problem, not a retry. Mirrors
    // the web SDK's CODED_ERRORS.
    if (err.code === 'entity_type_mismatch') {
      return new VerificationError('invalid_workflow', 'This verification is set up for a different kind of record. Contact the organisation that sent it.');
    }
    // 422 missing_documents: name what is missing rather than passing the
    // server's message through, which names raw document keys. A server that
    // asks one document per group names the groups; an older one names each
    // document. Mirrors the web SDK's lib/errors.ts.
    if (err.code === 'missing_documents') {
      return new VerificationError('unknown', missingDocumentsMessage(err.body));
    }
    // Other 4xx — pass the server message through under the context's code.
    const code: VerificationErrorCode = context === 'upload' ? 'upload_failed' : 'unknown';
    return new VerificationError(code, err.message);
  }
  // fetch() throws a TypeError on network failure (offline / DNS).
  if (err instanceof TypeError) {
    return new VerificationError('network_error', 'Network error. Please check your connection and try again.');
  }
  const code: VerificationErrorCode = context === 'upload' ? 'upload_failed' : 'unknown';
  return new VerificationError(code, err instanceof Error ? err.message : 'Something went wrong. Please try again.');
}

function missingDocumentsMessage(body: Record<string, unknown> | undefined): string {
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const groupLabels = strings(body?.missingGroups).flatMap((key) => businessDocumentGroupTitle(key) ?? []);
  const labels = groupLabels.length > 0
    ? groupLabels
    : strings(body?.missing).map((key) => BUSINESS_DOCUMENT_LABELS[key as BusinessDocumentKey] ?? key);
  return labels.length > 0
    ? `Required business documents are missing: ${labels.join(', ')}. Please go back and upload them.`
    : 'Some required business documents are missing. Please go back and upload them.';
}
