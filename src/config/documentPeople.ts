// The people a company's own documents name, read as each document is
// uploaded, merged into the key-people step.
//
// The documents step comes before the key-people step, and a MEMART, a
// register of shareholders or an annual return already lists who runs and owns
// the company. Each such upload is read straight away (POST
// /business/documents/people) and the people it names are kept here by
// mediaId. The key-people step then merges them into its list once each, so
// the applicant confirms the names and adds what the page did not say,
// usually each person's email.
//
// Pure. Mirrors the web SDK's lib/document-people.ts and the Flutter SDK's
// config/document_people.dart: keep the three in lockstep.
import { MAX_KEY_PEOPLE_ROWS, type KeyPersonEntry } from './keyPeople';
import { addedByDocument, namedByDocument } from './documentPeopleSources';
import { prefillKeyPeople, samePerson } from './keyPeoplePrefill';
import { primaryRole } from './keyPeopleSections';
import type { BusinessApplicationState } from '../store/state';
import type { RegistryOfficer } from '../services/api';
import type { WorkflowBusinessConfig } from '../types/business';
import type { BusinessDocumentGroup } from './businessDocumentGroups';

/**
 * The documents that record a company's people. Mirrors kyc-core's
 * PEOPLE_NAMING_DOCUMENTS (business-documents/parties.ts); the server decides
 * in the end, this only saves asking about a tax return.
 */
export const PEOPLE_NAMING_DOCUMENTS: ReadonlySet<string> = new Set([
  'memart',
  'registry_extract',
  'annual_return',
  'register_of_directors',
  'shareholder_register',
  'share_certificate',
  'ubo_declaration',
  'business_registration',
]);

/** Whether an upload in this group is worth reading for its people. */
export function readsDocumentPeople(
  business: WorkflowBusinessConfig | undefined,
  group: Pick<BusinessDocumentGroup, 'types'>,
): boolean {
  const kp = business?.keyPeople;
  if (kp?.enabled !== true || kp.collect !== true) return false;
  return group.types.some((t) => PEOPLE_NAMING_DOCUMENTS.has(t.key));
}

export type DocumentPeopleAction =
  | { type: 'DOCUMENT_PEOPLE_READING'; payload: { mediaId: string } }
  | { type: 'DOCUMENT_PEOPLE_READ'; payload: { mediaId: string; people: RegistryOfficer[] | null } };

/** The application state after a read starts or finishes. */
export function documentPeopleReducer(
  app: BusinessApplicationState,
  action: DocumentPeopleAction,
): BusinessApplicationState {
  const { mediaId } = action.payload;
  const reading = (app.documentPeopleReading ?? []).filter((m) => m !== mediaId);
  if (action.type === 'DOCUMENT_PEOPLE_READING') {
    return { ...app, documentPeopleReading: [...reading, mediaId] };
  }
  const people = action.payload.people;
  // A read that finished after its document was removed or replaced is dropped:
  // the people of a file the applicant took back must not appear.
  const stillUploaded = app.documents.some((d) => d.mediaId === mediaId);
  if (!people || people.length === 0 || !stillUploaded) {
    return { ...app, documentPeopleReading: reading };
  }
  return {
    ...app,
    documentPeopleReading: reading,
    documentPeople: { ...(app.documentPeople ?? {}), [mediaId]: people },
  };
}

/** Uploads whose people are read but not yet in the key-people list. */
export function pendingDocumentPeople(app: BusinessApplicationState): string[] {
  const applied = new Set(app.documentPeopleApplied ?? []);
  const uploaded = new Set(app.documents.map((d) => d.mediaId));
  return Object.keys(app.documentPeople ?? {}).filter((m) => !applied.has(m) && uploaded.has(m));
}

/** Whether any upload still in the application is being read for its people. */
export function documentPeopleReading(app: BusinessApplicationState): boolean {
  const uploaded = new Set(app.documents.map((d) => d.mediaId));
  return (app.documentPeopleReading ?? []).some((m) => uploaded.has(m));
}

/**
 * The list with a document's people merged in.
 *
 * Someone already listed (the same person, by the register's name rule) gains
 * a role they did not have and fills an empty email or stake; what the
 * applicant or the register already put there is never overwritten. Anyone
 * else is added, up to the row limit. `added` counts the new rows.
 */
export function mergeDocumentPeople(
  rows: KeyPersonEntry[],
  people: RegistryOfficer[],
  defaultCountry: string,
  mediaId: string,
): { rows: KeyPersonEntry[]; added: number } {
  const next = rows.map((r) => ({ ...r, roles: [...r.roles] }));
  let added = 0;
  for (const person of prefillKeyPeople(people, defaultCountry)) {
    const i = next.findIndex((r) => r.name.trim() && samePerson(r.name, person.name));
    if (i >= 0) {
      const before = next[i]!;
      const roles = [...new Set([...before.roles, ...person.roles])];
      const after: KeyPersonEntry = {
        ...before,
        roles,
        role: primaryRole(roles),
        email: before.email.trim() ? before.email : person.email,
        ownershipPct: before.ownershipPct.trim() ? before.ownershipPct : person.ownershipPct,
      };
      next[i] = namedByDocument(before, after, mediaId);
      continue;
    }
    if (next.length >= MAX_KEY_PEOPLE_ROWS) break;
    next.push(addedByDocument(person, mediaId));
    added += 1;
  }
  return { rows: next, added };
}

/** How many different people the merged documents named, for the step's note. */
export function documentPeopleCount(app: BusinessApplicationState): number {
  const applied = new Set(app.documentPeopleApplied ?? []);
  const uploaded = new Set(app.documents.map((d) => d.mediaId));
  const names: string[] = [];
  for (const [mediaId, people] of Object.entries(app.documentPeople ?? {})) {
    if (!applied.has(mediaId) || !uploaded.has(mediaId)) continue;
    for (const p of people) {
      const name = (p.name ?? '').trim();
      if (name && !names.some((n) => samePerson(n, name))) names.push(name);
    }
  }
  return names.length;
}

/** The note while a document is being read for its people. */
/** The note when people from a removed document were kept because the applicant changed them. */
export function documentPeopleKeptNote(count: number): string {
  return count === 1
    ? '1 person came from a document you removed. We kept them because you had changed their details. Check they still belong.'
    : `${count} people came from a document you removed. We kept them because you had changed their details. Check they still belong.`;
}

/** The line on a card kept from a removed document. */
export const DOCUMENT_REMOVED_CARD_NOTE = 'From a document you removed. Check they belong.';

export const DOCUMENT_PEOPLE_READING_NOTE =
  'We are reading your company documents for the people they name. You can add people now, or they will be filled in when we finish.';

/** The note once the documents' people are in the list. Mirrors the web texts. */
export function documentPeopleAddedNote(count: number): string {
  return count === 1
    ? 'We filled in 1 person from your company documents. Check the details and add their email so we can send their verification link.'
    : `We filled in ${count} people from your company documents. Check the details and add each person's email so we can send their verification link.`;
}

/** The full-step reading screen's words. Mirrors the web texts. */
export const READING_SCREEN_COPY = {
  title: 'Reading your company documents',
  description:
    "We're finding the people your documents name, so you only need to check them and add their emails.",
  stages: [
    'Looking for the directors',
    'Looking for the shareholders and their stakes',
    'Checking the names belong to your company',
  ],
  slow: 'Long documents take a little longer. If it runs on, the list opens in a moment and the people are added when we finish.',
} as const;

/** "Found N people", the reading screen's last line and the notice's title. */
export function documentPeopleFoundTitle(count: number): string {
  return count === 1 ? 'Found 1 person' : `Found ${count} people`;
}
