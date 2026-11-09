import React from 'react';

import { DOCUMENT_HANDOVER_COPY } from '../../components/documentReviewCopy';
import { SubmittedWaiting } from '../SubmittedWaiting';

/**
 * What the step shows while a scan moves straight on, with the review screen
 * switched off: the photo is uploading and being checked, and there is nothing
 * to do. A problem brings the review back.
 */
export function DocumentHandover({
  retryInfo,
}: {
  retryInfo: { attempt: number; total: number } | null;
}): React.ReactElement {
  return (
    <SubmittedWaiting
      title={DOCUMENT_HANDOVER_COPY.title}
      description={
        retryInfo
          ? `Upload failed. Retrying (${retryInfo.attempt}/${retryInfo.total})…`
          : DOCUMENT_HANDOVER_COPY.description
      }
    />
  );
}
