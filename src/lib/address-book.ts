import type { VerificationStep } from '../types/config';
import type { SubjectType, WorkflowBusinessConfig } from '../types/business';
import { isBusinessFlow } from '../config/business';
import { isScopedBusiness } from './scope';

// The Toden address book in the flow: SAVING the confirmed address to the
// person's own book (a sheet after they confirm it; saving is their choice),
// and REUSING one they saved before (a sheet over the first address step, shown
// when the flow's email is recognised: a code, then a pick). Both are offered
// only when the server says the
// platform and this organisation have them on, never on a business premises
// (a person's book is not a company's address) and never in the builder
// preview, which calls no Toden account endpoints.
//
// A MIRROR of the web SDK's lib/address-book.ts and the Flutter SDK's
// config/address_book.dart. Change the three together.

export interface AddressBookFacts {
  serverConfig?: { addressBook?: { save?: boolean; reuse?: boolean } | null } | null;
  /** The builder preview (web only): never set on this SDK, kept for the mirror. */
  previewMode?: boolean;
  subjectType?: SubjectType;
  business?: WorkflowBusinessConfig;
  scope?: string;
}

export interface AddressBookOffer {
  save: boolean;
  reuse: boolean;
}

export function addressBookOffer(config: AddressBookFacts): AddressBookOffer {
  const book = config.serverConfig?.addressBook;
  if (!book || config.previewMode) return { save: false, reuse: false };
  // A book is a person's: no business subject, KYB or scoped, is offered one.
  if (config.subjectType === 'business' || isBusinessFlow(config) || isScopedBusiness(config)) {
    return { save: false, reuse: false };
  }
  return { save: book.save === true, reuse: book.reuse === true };
}

/** The address capture steps a picked saved address replaces. */
const CAPTURE_STEPS: ReadonlySet<VerificationStep> = new Set<VerificationStep>([
  'address-search',
  'address-collection',
  'address-entrance',
  'address-review',
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The email the saved address offer asks about: the one the integrator passed
 * when starting the flow, else one the person proved with a code in this flow.
 * The offer never asks anybody to type one: no email, no offer.
 */
export function addressBookEmail(
  passed: string | null | undefined,
  contact: { emailAddress?: string; emailToken?: string } | null | undefined,
): string | null {
  const given = passed?.trim();
  if (given && EMAIL.test(given)) return given;
  const proved = contact?.emailToken ? contact.emailAddress?.trim() : null;
  return proved && EMAIL.test(proved) ? proved : null;
}

/**
 * With a saved address picked, the capture steps have nothing to do: a step
 * that would land on one (Back from the step after the address, a refusal's
 * Go back) lands on the address book step instead, where the person can keep
 * their pick or use a different address.
 */
export function reusedAddressStep(step: VerificationStep, reused: boolean): VerificationStep {
  return reused && CAPTURE_STEPS.has(step) ? 'address-book' : step;
}

/** What the person chose to save with the address. Nothing until they choose. */
export interface AddressBookSaveChoice {
  save: boolean;
  photo: boolean;
  directions: boolean;
}

export const NO_SAVE: AddressBookSaveChoice = { save: false, photo: false, directions: false };

/** The `address.book` block of the submission, or nothing when not saving. */
export function addressBookSaveBlock(
  choice: AddressBookSaveChoice | null | undefined,
  facts: { hasPhoto: boolean; hasDirections: boolean },
): { book?: AddressBookSaveChoice } {
  if (!choice?.save) return {};
  return {
    book: {
      save: true,
      photo: choice.photo && facts.hasPhoto,
      directions: choice.directions && facts.hasDirections,
    },
  };
}

/** One saved address as the offer lists it (street and area only). */
export interface SavedAddress {
  entryId: string;
  label: string | null;
  area: string | null;
  countryCode: string | null;
  tier: string | null;
  presenceStatus: string | null;
  presenceDecidedAt: string | null;
}

/** The picked saved address, carried to the submission. */
export interface AddressBookReuse {
  grant: string;
  entryId: string;
  label: string | null;
  area: string | null;
}

/** How a saved address reads in a list: its street, else its area. */
export function savedAddressLine(a: Pick<SavedAddress, 'label' | 'area'>): string {
  return [a.label, a.area].filter((v): v is string => Boolean(v && v.trim())).join(', ');
}

/**
 * How long a saved "verified" presence verdict stands in for a fresh presence
 * check. Mirrors kyc-core lib/address-book/reuse/coverage.ts; the server is
 * authoritative and refuses a stale pick with `address_book_reuse_stale`.
 */
export const PRESENCE_REUSE_WINDOW_DAYS = 180;

/** Whether a saved address can stand in for this flow's presence check. */
export function presenceVerdictIsRecent(
  a: Pick<SavedAddress, 'presenceStatus' | 'presenceDecidedAt'>,
  now = new Date(),
): boolean {
  if (a.presenceStatus !== 'verified' || !a.presenceDecidedAt) return false;
  const decided = new Date(a.presenceDecidedAt).getTime();
  return Number.isFinite(decided) && now.getTime() - decided <= PRESENCE_REUSE_WINDOW_DAYS * 86_400_000;
}

/**
 * The saved addresses this flow can take. A flow that runs a presence check
 * needs a recent verdict: a fresh check cannot run on a reused address, because
 * its pin never reaches this device. Returns how many were left out so the sheet
 * can say why.
 */
export function usableSavedAddresses(
  addresses: SavedAddress[],
  flowRunsPresence: boolean,
  now = new Date(),
): { usable: SavedAddress[]; hidden: number } {
  if (!flowRunsPresence) return { usable: addresses, hidden: 0 };
  const usable = addresses.filter((a) => presenceVerdictIsRecent(a, now));
  return { usable, hidden: addresses.length - usable.length };
}

/**
 * The offer sheet's title. With a name it greets the person, and only ever by
 * what the host app passed in `userData`: the address book's own name stays
 * private, or anyone holding an email could read whose it is. No name keeps the
 * plain title rather than leaving a stray comma.
 */
export function offerTitleKey(firstName: string | null | undefined): string {
  return firstName?.trim() ? 'address.book.offer.titleNamed' : 'address.book.offer.title';
}
