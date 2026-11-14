import { useEffect, useRef, useState } from 'react';

import { useEffectiveCountry, useFlowState, useVerificationConfig } from '../../components/runtime';
import {
  countsAsFailedCheck,
  livenessAttemptLimit,
  type LivenessFailedResult,
} from '../../lib/liveness-attempts';
import { reportLivenessFailure } from '../../lib/liveness-failure-report';
import type { LivenessFailureReason, LivenessPhase } from '../../liveness/types';

/**
 * Report each failed liveness check to the server when the workflow sets
 * `maxLivenessAttempts`, and hand back its answer for the failure panel.
 *
 * Once per failure: the report fires when the machine enters `failed` and is
 * re-armed when it leaves (Try Again). Only a failed CHECK counts; camera
 * problems, permission and upload errors never reach here. The answer is
 * dropped when it lands after the person has already tried again, so a late
 * one never labels the next run; a decline is acted on whenever it lands.
 */
export function useLivenessFailureReport(
  phase: LivenessPhase,
  failureReason: LivenessFailureReason | null,
): LivenessFailedResult | null {
  const config = useVerificationConfig();
  const api = useFlowState((s) => s.api);
  const sessionId = useFlowState((s) => s.sessionId);
  const markDeclined = useFlowState((s) => s.markDeclined);
  const country = useEffectiveCountry();
  const limited = livenessAttemptLimit(config.maxLivenessAttempts) !== null;

  const [result, setResult] = useState<LivenessFailedResult | null>(null);
  const reportedRef = useRef(false);
  // Bumped whenever the failure it answers is over, so a late answer is dropped.
  const runRef = useRef(0);

  const failed = phase === 'failed';
  useEffect(() => {
    if (!failed) {
      reportedRef.current = false;
      runRef.current += 1;
      setResult(null);
      return;
    }
    if (!limited || reportedRef.current || !countsAsFailedCheck(failureReason)) return;
    reportedRef.current = true;
    const run = runRef.current;
    void reportLivenessFailure({
      livenessFailed: (body) => api.livenessFailed(body),
      markDeclined: (refusal) => markDeclined(refusal),
      sessionId,
      country,
    }).then((answer) => {
      if (answer && runRef.current === run) setResult(answer);
    });
  }, [failed, failureReason, limited, api, sessionId, country, markDeclined]);

  // Unmounted mid-flight: nothing left to label.
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  return failed ? result : null;
}
