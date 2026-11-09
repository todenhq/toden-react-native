import { useCallback, useState } from 'react';

import { useFlowState, useVerificationStore } from '../../components/runtime';
import { withRetry } from '../../services/retry';
import { compressDocumentImage } from '../../services/mediaCompress';
import { withGroupUpload, type BusinessDocumentGroup } from '../../config/businessDocumentGroups';
import { useBusinessDocumentAttach, type AttachableSlot } from '../useBusinessDocumentAttach';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';
import { readsDocumentPeople } from '../../config/documentPeople';
import { useVerificationConfig } from '../../components/runtime';

// ---------------------------------------------------------------------------
// Uploading and removing a group's document. Each file uploads at once (type
// 'business_document'); the group then holds that one document, replacing any
// it had. The applicant never says which document it is: the upload names its
// group, and the server recognises the document from its text. Until then its
// `type` is the group's first document. Uploads ride flow state as
// `[{ type, group, mediaId, fileName, size }]`. Mirrors the web SDK's
// use-group-upload.
// ---------------------------------------------------------------------------

/** What the picker hands back to the uploader: the group being filled. */
export interface GroupSlot extends AttachableSlot {
  group: BusinessDocumentGroup;
}

/** The slot for a group. Its key names a photo taken with the camera. */
export function groupSlot(group: BusinessDocumentGroup): GroupSlot {
  return { key: group.key.replace(/_/g, '-'), label: group.title, group };
}

export function useGroupUpload() {
  const store = useVerificationStore();
  const config = useVerificationConfig();
  const uploads = useFlowState((s) => s.businessApplication.documents);
  /** The group whose file is uploading. */
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Read the upload for the people it names, in the background, so the
   * key-people step opens with them. Best-effort: any failure leaves the step
   * as it always was, and the document is checked again at submission.
   * Mirrors the web SDK's use-group-upload.
   */
  const readPeople = useCallback((group: BusinessDocumentGroup, mediaId: string) => {
    const s = store.getState();
    const country = s.business.country || config.business?.country;
    if (!s.sessionId || !country || !readsDocumentPeople(config.business, group)) return;
    s.documentPeopleRead({ type: 'DOCUMENT_PEOPLE_READING', payload: { mediaId } });
    const number = s.business.registrationNumber.trim();
    const name = s.business.registrationName.trim();
    s.api
      .businessDocumentPeople({
        sessionId: s.sessionId,
        mediaId,
        group: group.key,
        country,
        ...(number ? { registrationNumber: number } : {}),
        ...(name ? { registrationName: name } : {}),
      })
      .then((res) =>
        store.getState().documentPeopleRead({
          type: 'DOCUMENT_PEOPLE_READ',
          payload: { mediaId, people: res.read ? (res.people ?? []) : null },
        }),
      )
      .catch(() =>
        store.getState().documentPeopleRead({ type: 'DOCUMENT_PEOPLE_READ', payload: { mediaId, people: null } }),
      );
  }, [store, config]);

  const attach = useCallback(
    async (slot: GroupSlot, uri: string, mimeType: string | undefined, name: string, size?: number) => {
      setUploading(slot.group.key);
      setError(null);
      try {
        // A PDF is passed through untouched: re-encoding would destroy the
        // text the server reads off it.
        const isPdf = (mimeType ?? '').toLowerCase().startsWith('application/pdf');
        const finalUri = isPdf ? uri : await compressDocumentImage(uri).catch(() => uri);
        const mediaId = await withRetry(() =>
          store.getState().api.upload({ uri: finalUri, type: mimeType, name }, 'business_document'),
        );
        // Preview details ride the RECORD so the thumbnail survives leaving
        // the step; screen-local state dies with the component.
        const current = store.getState().businessApplication.documents;
        store.getState().setBusinessDocuments(
          withGroupUpload(slot.group, current, {
            type: slot.group.types[0]!.key,
            group: slot.group.key,
            mediaId,
            fileName: name,
            ...(typeof size === 'number' ? { size } : {}),
            ...(isPdf ? { isPdf: true } : { previewUri: finalUri }),
          }),
        );
        readPeople(slot.group, mediaId);
      } catch {
        setError(COPY.errorUpload);
      } finally {
        setUploading(null);
      }
    },
    [store, readPeople],
  );

  const pickers = useBusinessDocumentAttach<GroupSlot>(attach, setError);

  const remove = useCallback(
    (group: BusinessDocumentGroup) => {
      setError(null);
      const current = store.getState().businessApplication.documents;
      store.getState().setBusinessDocuments(
        current.filter((d) => !group.types.some((x) => x.key === d.type)),
      );
    },
    [store],
  );

  return {
    uploads,
    uploading,
    error,
    clearError: () => setError(null),
    remove,
    ...pickers,
  };
}

export type GroupUpload = ReturnType<typeof useGroupUpload>;
