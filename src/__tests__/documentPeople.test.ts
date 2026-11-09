import type { BusinessApplicationState } from '../store/state';
import type { KeyPersonEntry } from '../config/keyPeople';
import {
  documentPeopleCount,
  documentPeopleReading,
  documentPeopleReducer,
  mergeDocumentPeople,
  pendingDocumentPeople,
  readsDocumentPeople,
} from '../config/documentPeople';

const app = (over: Partial<BusinessApplicationState> = {}): BusinessApplicationState => ({
  keyPeople: [],
  documents: [{ type: 'memart', group: 'company_details', mediaId: 'med_1', fileName: 'm.pdf', size: 10 }],
  applicantRole: null,
  applicantName: '',
  applicantKeyPersonIndex: null,
  uboUnidentifiable: false,
  ...over,
});

const row = (over: Partial<KeyPersonEntry>): KeyPersonEntry => ({
  name: '',
  role: 'director',
  roles: ['director'],
  title: '',
  email: '',
  country: 'GH',
  ownershipPct: '',
  isCorporate: false,
  registrationNumber: '',
  owners: [],
  ...over,
});

const people = [
  { name: 'Ama Mensah', designation: 'DIRECTOR', roles: ['director', 'beneficial_owner'], ownershipPct: 60, email: null },
  { name: 'Kofi Boateng', designation: 'SHAREHOLDER', roles: ['shareholder'], ownershipPct: 40, email: 'kofi@example.com' },
];

describe('people read from the company documents', () => {
  it('reads only people-naming groups on a workflow that collects key people', () => {
    const business = { country: 'GH', keyPeople: { enabled: true, collect: true } } as never;
    expect(readsDocumentPeople(business, { types: [{ key: 'memart' } as never] })).toBe(true);
    expect(readsDocumentPeople(business, { types: [{ key: 'tax_document' } as never] })).toBe(false);
    expect(readsDocumentPeople({ country: 'GH', keyPeople: { enabled: true } } as never, { types: [{ key: 'memart' } as never] })).toBe(false);
  });

  it('tracks a read, keeps its people, and drops a read whose document was taken back', () => {
    let s = documentPeopleReducer(app(), { type: 'DOCUMENT_PEOPLE_READING', payload: { mediaId: 'med_1' } });
    expect(documentPeopleReading(s)).toBe(true);
    s = documentPeopleReducer(s, { type: 'DOCUMENT_PEOPLE_READ', payload: { mediaId: 'med_1', people } });
    expect(documentPeopleReading(s)).toBe(false);
    expect(pendingDocumentPeople(s)).toEqual(['med_1']);

    const removed = documentPeopleReducer({ ...app(), documents: [] }, { type: 'DOCUMENT_PEOPLE_READ', payload: { mediaId: 'med_1', people } });
    expect(removed.documentPeople).toBeUndefined();
  });

  it('adds new people and fills only what is missing on someone already listed', () => {
    const rows = [row({ name: 'AMA MENSAH', email: 'ama@own.example', ownershipPct: '55' })];
    const merged = mergeDocumentPeople(rows, people, 'GH', 'med_1');
    expect(merged.added).toBe(1);
    expect(merged.rows).toHaveLength(2);
    expect(merged.rows[0]).toMatchObject({ email: 'ama@own.example', ownershipPct: '55', role: 'beneficial_owner' });
    expect(merged.rows[0]!.roles).toEqual(expect.arrayContaining(['director', 'beneficial_owner']));
    expect(merged.rows[1]).toMatchObject({ name: 'Kofi Boateng', email: 'kofi@example.com', ownershipPct: '40' });
  });

  it('merges a document once, and counts the people it named', () => {
    const s = app({ documentPeople: { med_1: people }, documentPeopleApplied: ['med_1'] });
    expect(pendingDocumentPeople(s)).toEqual([]);
    expect(documentPeopleCount(s)).toBe(2);
  });
});
