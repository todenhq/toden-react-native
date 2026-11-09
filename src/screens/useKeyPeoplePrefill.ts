import { useEffect, useRef } from 'react';

import { useFlowState, useVerificationStore } from '../components/runtime';
import { prefillKeyPeople, shouldPrefill } from '../config/keyPeoplePrefill';
import {
  documentPeopleCount,
  documentPeopleReading,
  mergeDocumentPeople,
  pendingDocumentPeople,
} from '../config/documentPeople';
import { withoutRemovedDocuments } from '../config/documentPeopleSources';
import type { KeyPersonEntry } from '../config/keyPeople';

// What the key-people step opens with. First the register's own officer list
// (fetched by the paid check at selection), so the step is a confirmation
// rather than a memory test: once only, and never over anything typed. Then
// the people the company's own documents name (read as each was uploaded,
// config/documentPeople.ts), merged once per document. A read that finishes
// while the step is open is merged when it lands. And the people of a document
// the applicant has since removed or replaced are taken back out
// (config/documentPeopleSources.ts). One store write for all three, so none
// overwrites another. Mirrors the web SDK's use-key-people-prefill.
export function useKeyPeoplePrefill(rows: KeyPersonEntry[], defaultCountry: string) {
  const store = useVerificationStore();
  const officers = useFlowState((s) => s.businessCheck.officers);
  const app = useFlowState((s) => s.businessApplication);
  const prefilled = useRef(false);
  const pending = pendingDocumentPeople(app);
  const pendingKey = pending.join(',');
  const uploadedKey = app.documents.map((d) => d.mediaId).join(',');

  useEffect(() => {
    const uploaded = new Set(app.documents.map((d) => d.mediaId));
    const pruned = withoutRemovedDocuments(rows, uploaded);
    const fromRegister = !prefilled.current && officers.length > 0 && shouldPrefill(pruned.rows);
    if (!fromRegister && pending.length === 0 && pruned.rows === rows) return;
    let next = pruned.rows;
    if (fromRegister) {
      prefilled.current = true;
      next = prefillKeyPeople(officers, defaultCountry);
    }
    for (const mediaId of pending) {
      next = mergeDocumentPeople(next, app.documentPeople?.[mediaId] ?? [], defaultCountry, mediaId).rows;
    }
    // A removed document's people may be read again if it comes back.
    const applied = [...(app.documentPeopleApplied ?? []), ...pending].filter((m) => uploaded.has(m));
    store.getState().applyDocumentPeople(next, applied);
    // rows/app are deliberately out of the dep list: this must run on the
    // arrival of officers or of a document's people, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officers, defaultCountry, pendingKey, uploadedKey]);

  return {
    fromDocuments: documentPeopleCount(app),
    readingDocuments: documentPeopleReading(app),
    /** A read has landed whose people are not in the list yet. */
    merging: pending.length > 0,
    /** People kept from a removed document because the applicant had changed them. */
    keptFromRemoved: rows.filter((r) => r.documentRemoved).length,
  };
}
