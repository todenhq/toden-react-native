// ---------------------------------------------------------------------------
// The smart-address block of a submission (Address Intelligence), split from
// submit.ts (200-line rule). Pure: state in, request fields out.
// ---------------------------------------------------------------------------

import { addressPayload } from '../config/addressCollection';
import { addressBookSaveBlock } from '../lib/address-book';
import type { VerifyRequest } from '../services/api';
import type { VerificationState } from './state';

/**
 * The smart-address block: a saved address picked from the Toden address book
 * (its grant and entry, INSTEAD of a pin), else the captured pin with the
 * person's "save to my Toden address book" choice. Mirrors the web SDK's
 * steps/address-submission.ts.
 */
export function addressSubmission(state: VerificationState): Pick<VerifyRequest, 'address' | 'addressBookReuse'> {
  const reuse = state.addressBookReuse;
  if (reuse) return { addressBookReuse: { grant: reuse.grant, entryId: reuse.entryId } };
  if (!state.address) return {};
  return {
    address: {
      ...addressPayload(state.address, state.config.addressCollection),
      ...addressBookSaveBlock(state.address.book, {
        hasPhoto: Boolean(state.mediaIds.addressPhoto),
        hasDirections: Boolean(state.address.directions?.trim()),
      }),
    },
  };
}

/** A picked saved address carries no photo: the book keeps its own. */
export function withoutReusedPhoto(state: VerificationState): { addressPhoto?: undefined } {
  return state.addressBookReuse ? { addressPhoto: undefined } : {};
}
