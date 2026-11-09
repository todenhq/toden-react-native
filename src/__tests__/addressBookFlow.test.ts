// ─── The Toden address book in this SDK's flow ───────────────────────────────
//
// The offer of a saved address is a sheet over the first address step, so no
// step leads the address flow any more: the order is the capture steps until a
// saved address is picked. What is pinned here is the store's side: a pick
// replaces the capture steps (forwards, backwards and on a refusal's Go back),
// a refusal or a change of mind brings the offer back, and the submission sends
// the grant INSTEAD of a pin (or the pin with the save choice).
import { createVerificationStore, stepOrderOptions } from '../store/verificationStore';
import { buildStepOrder } from '../config/stepOrder';
import { addressSubmission, withoutReusedPhoto } from '../store/address-submission';
import { addressBookReuseRefusal, recoveryStepFor } from '../lib/submit-recovery';
import { addressBookMeta } from '../screens/address/meta';
import { VerificationApiError } from '../services/api';
import type { ResolvedVerificationConfig } from '../types/config';
import type { ServerConfigState } from '../store/serverConfig';

jest.useFakeTimers();
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

jest.mock('../services/api', () => {
  const actual = jest.requireActual('../services/api');
  return { ...actual, createVerificationApi: () => ({}) };
});

const CONFIG = {
  apiKey: 'pk_test_x',
  country: 'NG',
  consentStep: false,
  scope: 'address',
  addressCollection: { enabled: true },
  questionnaire: { enabled: true, fields: [{ key: 'q', label: 'Q', type: 'text' }] },
  metadata: {},
} as unknown as ResolvedVerificationConfig;

const READY = (reuse: boolean): ServerConfigState =>
  ({
    status: 'ready',
    idTypes: [],
    addressSearch: true,
    addressSearchMode: 'autocomplete',
    mapsFrameUrl: null,
    environment: 'DEVELOPMENT',
    addressBook: { save: true, reuse },
    fatal: false,
  }) as unknown as ServerConfigState;

const PICK = { grant: 'abr_1', entryId: 'adb_1', label: 'Bassey Street', area: 'Calabar' };

describe('the address book step in the order', () => {
  it('is not a step of its own: the flow opens on capture, with the offer idle', () => {
    for (const reuse of [true, false]) {
      const store = createVerificationStore(CONFIG, READY(reuse));
      expect(store.getState().currentStep).toBe('address-search');
      expect(buildStepOrder(stepOrderOptions(store.getState()))).not.toContain('address-book');
      expect(store.getState().addressBookFlow.phase).toBe('idle');
    }
  });

  it('is never offered on a business premises', () => {
    const business = { ...CONFIG, subjectType: 'business' } as ResolvedVerificationConfig;
    expect(buildStepOrder(stepOrderOptions(createVerificationStore(business, READY(true)).getState()))).not.toContain(
      'address-book',
    );
  });

  it('walks past the capture steps once a saved address is picked, both ways', () => {
    const store = createVerificationStore(CONFIG, READY(true));
    store.getState().setAddressBookReuse(PICK);
    // A capture step the flow no longer has lands on the address book step.
    store.getState().goToStep('address-search');
    expect(store.getState().currentStep).toBe('address-book');
    store.getState().nextStep();
    expect(store.getState().currentStep).toBe('questionnaire');
    store.getState().previousStep();
    expect(store.getState().currentStep).toBe('address-book');
    // A Go back aimed at a capture step lands on the address book step.
    store.getState().goToStep('address-collection');
    expect(store.getState().currentStep).toBe('address-book');
  });
});

describe('leaving a picked address', () => {
  it('brings the offer back and the capture steps with it', () => {
    const store = createVerificationStore(CONFIG, READY(true));
    store.getState().setAddressBookReuse(PICK);
    store.getState().restartAddressBook();
    expect(store.getState().addressBookReuse).toBeNull();
    expect(store.getState().addressBookFlow.phase).toBe('offer');
    expect(buildStepOrder(stepOrderOptions(store.getState()))).toContain('address-search');
  });
});

describe('a refused pick', () => {
  it('drops the pick and brings the offer back, saying so', () => {
    const store = createVerificationStore(CONFIG, READY(true));
    store.getState().setAddressBookReuse(PICK);
    store.getState().addressBookReuseRefused();
    expect(store.getState().addressBookReuse).toBeNull();
    expect(store.getState().addressBookFlow).toMatchObject({ phase: 'offer', refused: true });
    // Picking again clears the refusal.
    store.getState().setAddressBookReuse(PICK);
    expect(store.getState().addressBookFlow.refused).toBe(false);
  });

  it('is recognised from the server code and goes back to the address step', () => {
    const refusal = (code: string) => new VerificationApiError('no', 422, code, { error: code });
    expect(addressBookReuseRefusal(refusal('address_book_reuse_invalid'))).toBe(true);
    expect(addressBookReuseRefusal(refusal('address_book_reuse_stale'))).toBe(true);
    expect(addressBookReuseRefusal(refusal('missing_address_fields'))).toBe(false);
    const order = ['address-search', 'address-collection', 'questionnaire', 'submitted'] as const;
    expect(recoveryStepFor('address_book_reuse_stale', order)).toBe('address-collection');
  });
});

describe('the submission', () => {
  it('sends the grant instead of the pin and leaves the photo behind', () => {
    const store = createVerificationStore(CONFIG, READY(true));
    store.getState().setAddress({ lat: 4.9, lng: 8.3, accuracy: null, directions: '', propertyName: '', propertyNumber: '' });
    store.getState().setAddressPhoto('med_photo');
    store.getState().setAddressBookReuse(PICK);
    expect(addressSubmission(store.getState())).toEqual({ addressBookReuse: { grant: 'abr_1', entryId: 'adb_1' } });
    expect(withoutReusedPhoto(store.getState())).toEqual({ addressPhoto: undefined });
  });

  it('carries the save choice on a captured pin', () => {
    const store = createVerificationStore(CONFIG, READY(true));
    store.getState().setAddress({ lat: 4.9, lng: 8.3, accuracy: null, directions: 'Blue gate', propertyName: '', propertyNumber: '' });
    expect(addressSubmission(store.getState()).address).not.toHaveProperty('book');
    store.getState().setAddressBookSave({ save: true, photo: true, directions: true });
    expect(addressSubmission(store.getState()).address?.book).toEqual({ save: true, photo: false, directions: true });
    // The entrance photo goes with a saved address whenever there is one.
    store.getState().setAddressPhoto('med_photo');
    expect(addressSubmission(store.getState()).address?.book).toEqual({ save: true, photo: true, directions: true });
  });
});

describe('the header', () => {
  it('names the picked address', () => {
    expect(addressBookMeta().title).toBe('Your saved address');
  });
});
