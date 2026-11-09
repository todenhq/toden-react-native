// Search by company name: the request it sends and the refusals that move the
// applicant to registration-number entry.
//
// Some registers charge per search (read through Didit), so the server needs
// the attempt session a search belongs to: one charge is scoped to and capped
// by it. A workflow can also switch search by name off (`business.nameSearch:
// false`). Mirrors the web SDK's `lib/business-search.ts` and Flutter's
// `config/business_search.dart`; keep the three in lockstep.

import type { WorkflowBusinessConfig } from '../types/business';

/**
 * Refusals after which search by name is not coming back for this attempt, so
 * the applicant is moved to registration-number entry. Never shown as "no
 * matches", which reads as "not registered". `search_unavailable` and
 * `search_rate_limited` are deliberately NOT here: they pass, so the search
 * stays and can be retried.
 */
export const BUSINESS_SEARCH_REFUSALS: readonly string[] = [
  'business_search_disabled',
  'session_required',
  'session_not_found',
  'insufficient_credits',
  'search_limit_reached',
  'pricing_not_configured',
];

/** Whether the workflow offers search by name (absent = on). */
export function nameSearchOffered(business: Pick<WorkflowBusinessConfig, 'nameSearch'> | null | undefined): boolean {
  return business?.nameSearch !== false;
}

export interface BusinessSearchParams {
  country: string;
  query: string;
  subdivisionCode?: string;
  limit?: number;
  /** The attempt session; the same id `business/select` sends. */
  sessionId?: string | null;
}

/** The query string of `GET /business/search`. */
export function businessSearchQuery(params: BusinessSearchParams): string {
  const qs = new URLSearchParams({ country: params.country, query: params.query });
  if (params.subdivisionCode) qs.set('subdivisionCode', params.subdivisionCode);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.sessionId) qs.set('sessionId', params.sessionId);
  return qs.toString();
}

/**
 * The refusal an error carries, or null when it is not one (an outage or a
 * throttle, which keep the search on screen). The server's own message is kept
 * so the applicant reads why; null when it sent none.
 */
export function businessSearchRefusal(err: unknown): { code: string; message: string | null } | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== 'string' || !BUSINESS_SEARCH_REFUSALS.includes(code)) return null;
  const body = (err as { body?: Record<string, unknown> }).body;
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;
  return { code, message };
}

/** What the details step says when search was refused and the server sent no message. */
export const SEARCH_REFUSED_FALLBACK =
  'Search by name is not available for this verification. Enter the registration number.';

export interface BusinessPickView {
  /** The registration number box (search off, refused, or "enter the number"). */
  numberEntry: boolean;
  /** The name search, visible. */
  search: boolean;
  /** The picked-company card (from search or an org's prefill). */
  card: boolean;
}

/**
 * What the FIRST screen of the business step shows. It always asks WHICH
 * company and nothing more; Continue checks the register and opens the second
 * screen filled in from its answer. With no search by name the question is the
 * registration number itself, never a jump to the full form. Mirrors the web
 * SDK and Flutter `businessPickView` (lockstep).
 */
export function businessPickView(input: {
  searchOffered: boolean;
  refused: boolean;
  manualEntry: boolean;
  picked: boolean;
}): BusinessPickView {
  const numberEntry = !input.searchOffered || input.refused || input.manualEntry;
  return { numberEntry, search: !numberEntry && !input.picked, card: !numberEntry && input.picked };
}

// Test companies from the sandbox search are listed as "<searched> Sandbox
// <outcome> Ltd" so the outcomes can be told apart. Picked, a company carries
// the name that was searched ("Transika Ltd"), so its own documents name the
// same company the register does. MIRRORS kyc-core's withoutSandboxLabel
// (business-search/sandbox.ts) and the other two SDKs: keep the labels in step.
const SANDBOX_OUTCOME_LABELS = [
  'Missing',
  'No Status',
  'Inactive',
  'Shareholders',
  'Late Shareholders',
  'Shareholders Unavailable',
  'No Shareholders',
  'No Key People',
];
const SANDBOX_LABELLED = new RegExp(
  `^(.+?)\\s+Sandbox(?:\\s+(?:${SANDBOX_OUTCOME_LABELS.join('|')}))?\\s+Ltd$`,
  'i',
);

/** The name to keep for a picked search result. */
export function pickedBusinessName(name: string): string {
  const m = SANDBOX_LABELLED.exec(name.trim());
  return m ? `${m[1]} Ltd` : name;
}
