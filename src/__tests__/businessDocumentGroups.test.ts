import {
  BUSINESS_DOCUMENT_GROUP_OF,
  BUSINESS_DOCUMENT_GROUP_ORDER,
  businessDocumentGroups,
  canLeaveGroup,
  firstOpenGroupIndex,
  groupUpload,
  withGroupUpload,
  businessDocumentsPayload,
  restoredBusinessDocuments,
  groupButtonLabel,
} from '../config/businessDocumentGroups';
import { BUSINESS_DOCUMENT_LABELS } from '../config/businessSteps';
import { BUSINESS_DOCUMENTS_COPY } from '../screens/business-documents/copy';
import { VerificationApiError } from '../services/api';
import { mapToVerificationError } from '../services/errors';
import type { WorkflowBusinessConfig } from '../types/business';

// One document per group. These vectors are copied from the web SDK's
// business-document-groups.test.ts (and the Flutter SDK's) and mirror
// kyc-core's business-document-groups.test.ts.

const business = (types: Array<{ key: string; required?: boolean; label?: string; maxAgeMonths?: number }>) =>
  ({ country: 'NG', documents: { enabled: true, types } }) as unknown as WorkflowBusinessConfig;

describe('businessDocumentGroups', () => {
  it('groups the ticked documents in group order, keeping the workflow order inside a group', () => {
    const groups = businessDocumentGroups(business([
      { key: 'annual_return' },
      { key: 'registry_extract', required: true },
      { key: 'incorporation_certificate' },
      { key: 'memart' },
    ]));
    expect(groups.map((g) => g.key)).toEqual(['legal_presence', 'company_details']);
    expect(groups[0]!.types.map((t) => t.key)).toEqual(['registry_extract', 'incorporation_certificate']);
    expect(groups[0]!.title).toBe('Legal presence');
    expect(groups[0]!.required).toBe(true);
    expect(groups[1]!.required).toBe(false);
  });

  it('titles the other group with the name the organisation wrote', () => {
    const [other] = businessDocumentGroups(business([{ key: 'other', label: 'Council tax letter' }]));
    expect(other!.title).toBe('Council tax letter');
  });

  it('defaults to a required certificate of incorporation, and nothing when documents are off', () => {
    const groups = businessDocumentGroups({ country: 'NG', documents: { enabled: true } } as unknown as WorkflowBusinessConfig);
    expect(groups.map((g) => [g.key, g.required, g.types.map((t) => t.key)])).toEqual([
      ['legal_presence', true, ['incorporation_certificate']],
    ]);
    expect(businessDocumentGroups({ country: 'NG' } as unknown as WorkflowBusinessConfig)).toEqual([]);
  });

  it('carries how recent each document must be, null when the workflow sets no window', () => {
    const [legal] = businessDocumentGroups(business([
      { key: 'good_standing_certificate', maxAgeMonths: 3 },
      { key: 'incorporation_certificate' },
    ]));
    expect(legal!.types).toEqual([
      { key: 'good_standing_certificate', label: 'Certificate of good standing', maxAgeMonths: 3 },
      { key: 'incorporation_certificate', label: 'Certificate of incorporation', maxAgeMonths: null },
    ]);
  });

  it('puts every catalogue document in a known group', () => {
    for (const group of Object.values(BUSINESS_DOCUMENT_GROUP_OF)) {
      expect(BUSINESS_DOCUMENT_GROUP_ORDER).toContain(group);
    }
  });

  it('gives every catalogue document a readable label, never its raw key', () => {
    for (const key of Object.keys(BUSINESS_DOCUMENT_GROUP_OF)) {
      const label = BUSINESS_DOCUMENT_LABELS[key as keyof typeof BUSINESS_DOCUMENT_LABELS];
      expect(label).toBeTruthy();
      expect(label).not.toContain('_');
    }
    expect(BUSINESS_DOCUMENT_LABELS.memart).toBe('Memorandum and articles / company constitution');
  });
});

describe('moving through the groups', () => {
  const groups = businessDocumentGroups(business([
    { key: 'incorporation_certificate', required: true },
    { key: 'registry_extract' },
    { key: 'memart' },
  ]));
  const [legal, details] = groups;

  it('holds one document per group: a second upload replaces the first', () => {
    const one = withGroupUpload(legal!, [], { type: 'incorporation_certificate', mediaId: 'm1' });
    const two = withGroupUpload(legal!, one, { type: 'registry_extract', mediaId: 'm2' });
    expect(two).toEqual([{ type: 'registry_extract', mediaId: 'm2' }]);
  });

  it('replaces a group upload made without a chosen type', () => {
    const one = withGroupUpload(legal!, [], { type: 'incorporation_certificate', group: 'legal_presence', mediaId: 'm1' });
    expect(withGroupUpload(legal!, one, { type: 'incorporation_certificate', group: 'legal_presence', mediaId: 'm2' }))
      .toEqual([{ type: 'incorporation_certificate', group: 'legal_presence', mediaId: 'm2' }]);
  });

  it('sends a group upload by its group, and an older one by its type', () => {
    expect(businessDocumentsPayload([
      { type: 'incorporation_certificate', group: 'legal_presence', mediaId: 'm1' },
      { type: 'memart', mediaId: 'm2' },
    ])).toEqual([{ group: 'legal_presence', mediaId: 'm1' }, { type: 'memart', mediaId: 'm2' }]);
  });

  it('labels the button Next between groups, Continue on the last, Skip on an empty optional group', () => {
    // groups: legal (required), details (optional)
    expect(groupButtonLabel(legal!, [], 0, 2)).toBe('next');
    expect(groupButtonLabel(legal!, [{ type: 'incorporation_certificate' }], 0, 2)).toBe('next');
    expect(groupButtonLabel(details!, [], 1, 2)).toBe('skip');
    expect(groupButtonLabel(details!, [{ type: 'memart' }], 1, 2)).toBe('continue');
    expect(groupButtonLabel(legal!, [{ type: 'incorporation_certificate' }], 0, 1)).toBe('continue');
    expect(BUSINESS_DOCUMENTS_COPY.nextButton).toBe('Next');
  });

  it('lets an optional group be skipped and holds a required one until it has a document', () => {
    expect(canLeaveGroup(legal!, [])).toBe(false);
    expect(canLeaveGroup(legal!, [{ type: 'registry_extract' }])).toBe(true);
    expect(canLeaveGroup(details!, [])).toBe(true);
  });

  it('opens on the first group with nothing uploaded, else the last group', () => {
    expect(firstOpenGroupIndex(groups, [])).toBe(0);
    expect(firstOpenGroupIndex(groups, [{ type: 'incorporation_certificate' }])).toBe(1);
    expect(firstOpenGroupIndex(groups, [{ type: 'incorporation_certificate' }, { type: 'memart' }])).toBe(1);
  });
});

describe('a refused submission naming missing documents', () => {
  const refuse = (body: Record<string, unknown>) =>
    mapToVerificationError(new VerificationApiError('missing', 422, 'missing_documents', body), 'verify');

  it('names the groups when the server sends them', () => {
    const e = refuse({ missing: ['registry_extract', 'incorporation_certificate'], missingGroups: ['legal_presence'] });
    expect(e.message).toBe('Required business documents are missing: Legal presence. Please go back and upload them.');
  });

  it('names each document for an older server, never the raw key', () => {
    const e = refuse({ missing: ['good_standing_certificate'] });
    expect(e.message).toContain('Certificate of good standing');
    expect(e.message).not.toContain('good_standing_certificate');
  });

  it('falls back to a general sentence with nothing named', () => {
    expect(refuse({}).message).toBe('Some required business documents are missing. Please go back and upload them.');
  });
});

describe('restoring a session', () => {
  const groups = businessDocumentGroups(business([
    { key: 'incorporation_certificate', required: true },
    { key: 'registry_extract' },
    { key: 'memart' },
  ]));
  const [legal, details] = groups;

  it('keeps an upload saved before groups were sent: found in its group by type, sent by type', () => {
    const restored = restoredBusinessDocuments([{ type: 'registry_extract', mediaId: 'm1', fileName: 'extract.pdf' }]);
    expect(restored).toEqual([{ type: 'registry_extract', mediaId: 'm1', fileName: 'extract.pdf' }]);
    expect(groupUpload(legal!, restored!)?.mediaId).toBe('m1');
    expect(groupUpload(details!, restored!)).toBeNull();
    expect(firstOpenGroupIndex(groups, restored!)).toBe(1);
    expect(businessDocumentsPayload(restored!)).toEqual([{ type: 'registry_extract', mediaId: 'm1' }]);
  });

  it('keeps the group of a newer upload, and drops what it cannot read', () => {
    const restored = restoredBusinessDocuments([
      { type: 'memart', group: 'company_details', mediaId: 'm2', fileName: 'memart.jpg', isPdf: false },
      { type: 'memart', group: 'not_a_group', mediaId: 'm3' },
      { type: 'memart' },
      'junk',
      null,
    ]);
    expect(restored).toEqual([
      { type: 'memart', group: 'company_details', mediaId: 'm2', fileName: 'memart.jpg' },
      { type: 'memart', mediaId: 'm3', fileName: '' },
    ]);
    expect(businessDocumentsPayload(restored!)).toEqual([
      { group: 'company_details', mediaId: 'm2' },
      { type: 'memart', mediaId: 'm3' },
    ]);
  });

  it('restores nothing from a snapshot without a document list', () => {
    expect(restoredBusinessDocuments(undefined)).toBeNull();
  });
});

describe('the step wording', () => {
  it('matches the web defaults for the carousel', () => {
    expect(BUSINESS_DOCUMENTS_COPY.accepts).toBe('Any one of these');
    expect(BUSINESS_DOCUMENTS_COPY.acceptsOne).toBe('Upload this document');
    expect(BUSINESS_DOCUMENTS_COPY.validity(3)).toBe('From the last 3 months');
    expect(BUSINESS_DOCUMENTS_COPY.progress(2, 5)).toBe('2 of 5');
    expect(BUSINESS_DOCUMENTS_COPY.next).toBe('Next');
    expect(BUSINESS_DOCUMENTS_COPY.skipped).toBe('Skipped');
    expect(BUSINESS_DOCUMENTS_COPY.change).toBe('Change');
    expect(BUSINESS_DOCUMENTS_COPY.tapToChoose).toBe('Tap to choose a file');
  });

  it('announces the group that opens with its position', () => {
    expect(BUSINESS_DOCUMENTS_COPY.opened(2, 4, 'Company details')).toBe('2 of 4: Company details');
  });

  it('never uses an em dash', () => {
    for (const value of Object.values(BUSINESS_DOCUMENTS_COPY)) {
      const text = typeof value === 'function' ? (value as (...a: unknown[]) => string)(1, 2, 'x') : value;
      expect(text).not.toContain('\u2014');
    }
  });
});
