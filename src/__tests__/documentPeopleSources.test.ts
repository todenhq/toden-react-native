
import { mergeDocumentPeople } from '../config/documentPeople';
import { withoutRemovedDocuments } from '../config/documentPeopleSources';
import type { KeyPersonEntry } from '../config/keyPeople';
import type { RegistryOfficer } from '../services/api';

const typed = (name: string): KeyPersonEntry => ({
  name,
  role: 'director',
  roles: ['director'],
  title: '',
  email: '',
  country: 'GH',
  ownershipPct: '',
  isCorporate: false,
  registrationNumber: '',
  owners: [],
});
const officer = (name: string, designation = 'DIRECTOR'): RegistryOfficer => ({ name, designation }) as RegistryOfficer;

describe('taking a removed document’s people back out', () => {
  it('removes the people a removed document added, and leaves the applicant’s own rows', () => {
    const merged = mergeDocumentPeople([typed('Ama Mensah')], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    const out = withoutRemovedDocuments(merged, new Set());
    expect(out.rows.map((r) => r.name)).toEqual(['Ama Mensah']);
    expect(out).toMatchObject({ removed: 1, kept: 0 });
  });

  it('keeps a person the applicant changed, flagged for them to check', () => {
    const merged = mergeDocumentPeople([], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    const edited = merged.map((r) => ({ ...r, email: 'kofi@example.com' }));
    const out = withoutRemovedDocuments(edited, new Set());
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ name: 'Kofi Boateng', documentRemoved: true, sourceDocuments: [] });
    expect(out.kept).toBe(1);
  });

  it('keeps a person while another uploaded document still names them', () => {
    let rows = mergeDocumentPeople([], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    rows = mergeDocumentPeople(rows, [officer('Kofi Boateng', 'SHAREHOLDER')], 'GH', 'med_2').rows;
    const out = withoutRemovedDocuments(rows, new Set(['med_2']));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.sourceDocuments).toEqual(['med_2']);
  });

  it('does not count the fill-in from a second document as the applicant’s edit', () => {
    let rows = mergeDocumentPeople([], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    rows = mergeDocumentPeople(rows, [{ ...officer('Kofi Boateng', 'SHAREHOLDER'), email: 'k@x.example' } as RegistryOfficer], 'GH', 'med_2').rows;
    const out = withoutRemovedDocuments(rows, new Set());
    expect(out.rows).toHaveLength(0);
  });

  it('returns the same list when nothing a document added is affected', () => {
    const rows = mergeDocumentPeople([], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    expect(withoutRemovedDocuments(rows, new Set(['med_1'])).rows).toBe(rows);
  });

  it('a replacement document naming a kept person clears the flag', () => {
    const merged = mergeDocumentPeople([], [officer('Kofi Boateng')], 'GH', 'med_1').rows;
    const kept = withoutRemovedDocuments(merged.map((r) => ({ ...r, email: 'k@x.example' })), new Set()).rows;
    const again = mergeDocumentPeople(kept, [officer('Kofi Boateng')], 'GH', 'med_9').rows;
    expect(again[0]).toMatchObject({ documentRemoved: undefined, sourceDocuments: ['med_9'] });
  });
});
