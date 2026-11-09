import { useCallback } from 'react';

import { useFlowState, useVerificationConfig, useVerificationStore } from '../../components/runtime';
import { VerificationApiError } from '../../services/api';
import { addressBookEmail, addressBookOffer, usableSavedAddresses, type SavedAddress } from '../../lib/address-book';
import type { AddressBookFlowState } from '../../store/addressBook';
import { useText } from '../../i18n/useText';

// The saved address offer's actions: lookup → offer → code → pick. The progress
// itself lives in the store (store/addressBook.ts), so closing the sheet holds
// for the rest of the attempt. A MIRROR of the web SDK's
// steps/address/use-address-book.ts.

/** The codes the address book sends are always six digits. */
export const ADDRESS_BOOK_CODE_LENGTH = 6;

export function useAddressBook() {
  const config = useVerificationConfig();
  const store = useVerificationStore();
  const t = useText();
  const book = useFlowState((s) => s.addressBookFlow);
  const chosen = useFlowState((s) => s.addressBookReuse);
  const contact = useFlowState((s) => s.contact);
  const serverConfig = useFlowState((s) => s.serverConfig);
  const email = addressBookEmail(config.userData?.email, contact);
  const reuse = addressBookOffer({ ...config, serverConfig }).reuse;
  const presence = config.addressCollection?.presence?.enabled === true;

  const patch = useCallback(
    (p: Partial<AddressBookFlowState>) => store.getState().patchAddressBookFlow(p),
    [store],
  );
  // A server refusal under 500 carries a sentence written for the person;
  // anything else (an outage, the network) is the generic line.
  const failure = (err: unknown): string =>
    err instanceof VerificationApiError && err.statusCode < 500 ? err.message : t('address.book.error');

  /** Ask once whether the email has an address to offer. Silent either way. */
  const lookUp = useCallback(async (): Promise<void> => {
    if (!reuse || !email || store.getState().addressBookFlow.phase !== 'idle') return;
    patch({ phase: 'checking' });
    const recognised = await store
      .getState()
      .api.addressBookLookup(email, presence)
      .then((r) => r.recognised)
      .catch(() => false);
    if (store.getState().addressBookFlow.phase === 'checking') patch({ phase: recognised ? 'offer' : 'closed' });
  }, [email, patch, presence, reuse, store]);

  /** Send the code (the offer's yes, and Send a new code). */
  const sendCode = async (): Promise<void> => {
    if (!email) return;
    patch({ busy: true, error: null, refused: false });
    try {
      const res = await store.getState().api.addressBookCode(email);
      patch({ busy: false, challengeId: res.challengeId, code: '', phase: 'code' });
    } catch (err) {
      patch({ busy: false, error: failure(err) });
    }
  };

  const checkCode = async (value = book.code): Promise<void> => {
    const challengeId = store.getState().addressBookFlow.challengeId;
    if (!challengeId || value.length !== ADDRESS_BOOK_CODE_LENGTH) return;
    patch({ busy: true, error: null, refused: false });
    try {
      const res = await store.getState().api.addressBookAddresses(challengeId, value);
      const listed = usableSavedAddresses(res.addresses, presence);
      patch({ busy: false, grant: res.grant, addresses: listed.usable, hidden: listed.hidden, phase: 'pick' });
    } catch (err) {
      patch({ busy: false, code: '', error: failure(err) });
    }
  };

  /** Keep the chosen saved address; the capture steps are skipped. */
  const choose = (entry: SavedAddress): void => {
    const grant = store.getState().addressBookFlow.grant;
    if (!grant) return;
    store.getState().setAddressBookReuse({ grant, entryId: entry.entryId, label: entry.label, area: entry.area });
  };

  return {
    phase: book.phase,
    email,
    code: book.code,
    setCode: (code: string) => patch({ code }),
    addresses: book.addresses,
    hidden: book.hidden,
    chosen,
    busy: book.busy,
    // The refusal that brought the person back here, until they act.
    error: book.error ?? (book.refused ? t('address.book.refused') : null),
    lookUp,
    sendCode,
    checkCode,
    choose,
    /** The person will enter an address: the offer stays closed. */
    close: () => patch({ phase: 'closed', error: null, refused: false, busy: false }),
    /** Back to the offer, from the picked address. */
    restart: () => store.getState().restartAddressBook(),
  };
}
