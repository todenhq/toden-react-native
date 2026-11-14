// ─── Reporting one failed liveness check ─────────────────────────────────────
//
// The one call the liveness step makes when a check fails on a workflow with
// `maxLivenessAttempts` (lib/liveness-attempts). Kept out of the hook so the
// outcomes are tested without React:
//
// - an answer: what the panel should say (attempts left, or nothing);
// - a declined session: the flow is marked declined and ends on that screen;
// - anything else (offline, a 5xx, an older server without the route): null,
//   so Try Again works exactly as before. Never retried, never awaited by the
//   retry.

import type { LivenessFailedResult } from './liveness-attempts';
import { declinedRefusalOf } from './session-declined';

export interface LivenessFailureReportDeps {
  livenessFailed: (body: { sessionId?: string; country?: string }) => Promise<LivenessFailedResult>;
  markDeclined: (refusal: { message: string | null; reasonCode: string | null }) => void;
  sessionId: string | null | undefined;
  country: string | null | undefined;
}

/** Report the failure; resolves to the answer, or null when there is none to show. */
export async function reportLivenessFailure(deps: LivenessFailureReportDeps): Promise<LivenessFailedResult | null> {
  try {
    return await deps.livenessFailed({
      ...(deps.sessionId ? { sessionId: deps.sessionId } : {}),
      ...(deps.country ? { country: deps.country } : {}),
    });
  } catch (err) {
    const declined = declinedRefusalOf(err);
    if (declined) deps.markDeclined(declined);
    return null;
  }
}
