import type { SavedAddress } from '../lib/address-book';
import type { VerificationState } from './state';

// ---------------------------------------------------------------------------
// The saved address offer's progress, split from verificationStore.ts (200-line
// rule): idle → offer → code → pick, or closed. It is a sheet over the first
// address capture step, not a step: the email comes from the flow (lib/address-
// book.ts), the server says whether it has an address this flow can take, and
// nothing shows when it does not. `closed` stays closed for the attempt, so a
// person who chose to enter an address is not asked again on the way back.
// ---------------------------------------------------------------------------

export type AddressBookPhase = 'idle' | 'checking' | 'offer' | 'code' | 'pick' | 'closed';

export interface AddressBookFlowState {
  phase: AddressBookPhase;
  challengeId: string | null;
  code: string;
  /** The one-time grant the addresses came with; spent by the submission. */
  grant: string | null;
  /** The saved addresses this flow can take (see usableSavedAddresses). */
  addresses: SavedAddress[];
  /** Saved addresses this flow cannot take (a presence flow needs a recent verdict). */
  hidden: number;
  busy: boolean;
  /** Already worded: the hook resolves it before writing it here. */
  error: string | null;
  /** The server refused the picked saved address (spent, expired or stale). */
  refused: boolean;
}

export const EMPTY_ADDRESS_BOOK_FLOW: AddressBookFlowState = {
  phase: 'idle',
  challengeId: null,
  code: '',
  grant: null,
  addresses: [],
  hidden: 0,
  busy: false,
  error: null,
  refused: false,
};

type Set = (partial: Partial<VerificationState> | ((s: VerificationState) => Partial<VerificationState>)) => void;

/** The store's address book actions (see their declarations in state.ts). */
export function addressBookActions(set: Set) {
  return {
    setAddressBookSave(choice: NonNullable<NonNullable<VerificationState['address']>['book']>): void {
      set((s) => (s.address ? { address: { ...s.address, book: choice } } : {}));
    },
    setAddressBookReuse(reuse: VerificationState['addressBookReuse']): void {
      set((s) => ({ addressBookReuse: reuse, addressBookFlow: { ...s.addressBookFlow, refused: false } }));
    },
    patchAddressBookFlow(patch: Partial<AddressBookFlowState>): void {
      set((s) => ({ addressBookFlow: { ...s.addressBookFlow, ...patch } }));
    },
    restartAddressBook(): void {
      // The email is already recognised, so the offer comes straight back.
      set({ addressBookReuse: null, addressBookFlow: { ...EMPTY_ADDRESS_BOOK_FLOW, phase: 'offer' } });
    },
    addressBookReuseRefused(): void {
      set({ addressBookReuse: null, addressBookFlow: { ...EMPTY_ADDRESS_BOOK_FLOW, phase: 'offer', refused: true } });
    },
  };
}
