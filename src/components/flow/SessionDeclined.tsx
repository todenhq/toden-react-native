import React, { useEffect, useRef } from 'react';

import { declinedScreenCopy, type DeclinedSession } from '../../lib/session-declined';
import { safeReportError } from '../../services/errors';
import { VerificationError } from '../../types/verification';
import { SessionEnded } from './SessionCancelled';

/**
 * Fire `onError` with `session_declined` ONCE, the first time the run is
 * marked declined, whichever request learned it (the contact check that
 * declined it, session start, a progress save, an upload or the submission).
 */
export function useReportDecline(
  declined: DeclinedSession | null,
  onError: ((error: VerificationError) => void) | undefined,
): void {
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!declined || reportedRef.current) return;
    reportedRef.current = true;
    safeReportError(onError, new VerificationError('session_declined', declinedScreenCopy(declined).body));
  }, [declined, onError]);
}

/**
 * The server declined this session before it was submitted
 * (lib/session-declined.ts), today because a contact code's attempts ran out
 * on a step with `declineOnLastAttempt`. Terminal, like the cancelled screen:
 * every later request on the session is refused, so the only action is Close.
 * The consumer is told through `onError` (`session_declined`) by the flow.
 */
export function SessionDeclined({
  declined,
  onClose,
}: {
  declined: DeclinedSession;
  onClose: () => void;
}): React.ReactElement {
  const { title, body } = declinedScreenCopy(declined);
  return <SessionEnded title={title} body={body} onClose={onClose} />;
}
