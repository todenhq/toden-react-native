import { businessSubmission } from '../store/derive';
import { createVerificationStore } from '../store/verificationStore';
import type { ResolvedVerificationConfig } from '../types/config';

// The submission names each upload's GROUP and leaves the document type to
// the server, which recognises it from the document's text. An upload
// restored from before groups were sent still names its type.

jest.useFakeTimers();

function storeWith(documents: unknown) {
  const store = createVerificationStore({
    apiKey: 'pk_test_x',
    country: 'NG',
    metadata: {},
    business: { country: 'NG', documents: { enabled: true, types: [{ key: 'incorporation_certificate' }, { key: 'memart' }] } },
  } as unknown as ResolvedVerificationConfig);
  store.getState().setBusinessDocuments(documents as never);
  return store;
}

describe('business documents on the submission', () => {
  it('sends a group upload as { group, mediaId } and an older one as { type, mediaId }', () => {
    const store = storeWith([
      { type: 'incorporation_certificate', group: 'legal_presence', mediaId: 'm1', fileName: 'cert.jpg', previewUri: 'file://x' },
      { type: 'memart', mediaId: 'm2', fileName: 'memart.pdf', isPdf: true },
    ]);
    expect(businessSubmission(store.getState()).payload.documents).toEqual([
      { group: 'legal_presence', mediaId: 'm1' },
      { type: 'memart', mediaId: 'm2' },
    ]);
  });

  it('sends no documents block when nothing was uploaded', () => {
    expect(businessSubmission(storeWith([]).getState()).payload.documents).toBeUndefined();
  });
});
