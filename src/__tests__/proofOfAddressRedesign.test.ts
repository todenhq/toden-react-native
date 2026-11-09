import { readFileSync } from 'fs';
import { join } from 'path';

import {
  POA_SUBTYPES_BY_KIND,
  acceptedSubtypes,
  joinWithOr,
  poaKindDays,
  poaKindSummary,
  poaPeriodLabel,
  poaSubtypeKey,
} from '../lib/poa-subtypes';
import { buildVerifyRequest } from '../store/submit';
import { createVerificationStore } from '../store/verificationStore';
import { defaultText } from '../i18n/translate';
import { buildDialCodeItems } from '../components/dialCodeRows';
import type { ResolvedVerificationConfig } from '../types/config';

// The Proof of Address step as the web SDK redesigned it (2026-11-07): the
// applicant picks the KIND, the server recognises the document within it; each
// kind states its documents and how recent it must be; the document's country
// rides the submission.

jest.useFakeTimers();

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the documents inside each kind', () => {
  it("lists a voter's ID card under government documents", () => {
    expect(POA_SUBTYPES_BY_KIND.government_document).toContain('voter_id');
  });

  it('narrows a kind the workflow names a document of, and leaves the others whole', () => {
    expect(acceptedSubtypes('utility_bill', ['water_bill', 'bank_statement'])).toEqual(['water_bill']);
    expect(acceptedSubtypes('tenancy_agreement', ['water_bill'])).toEqual([...POA_SUBTYPES_BY_KIND.tenancy_agreement]);
    expect(acceptedSubtypes('other', ['not_a_subtype'])).toEqual([...POA_SUBTYPES_BY_KIND.other]);
  });

  it('every document has a name and a short name', () => {
    for (const subtype of Object.values(POA_SUBTYPES_BY_KIND).flat()) {
      expect(defaultText(poaSubtypeKey(subtype))).not.toBe(poaSubtypeKey(subtype));
      const short = poaSubtypeKey(subtype).replace('.subtype.', '.subtypeShort.');
      expect(defaultText(short)).not.toBe(short);
    }
  });

  it('sums a kind up in one phrase joined with "or", capitalised', () => {
    expect(poaKindSummary('tenancy_agreement', undefined, defaultText, 'en')).toBe('Tenancy, lease, or title deed');
    expect(poaKindSummary('utility_bill', ['gas_bill'], defaultText, 'en')).toBe('Gas');
  });

  it('joins with "or" where the engine has no ListFormat (Hermes)', () => {
    const intl = Intl as unknown as { ListFormat?: unknown };
    const saved = intl.ListFormat;
    intl.ListFormat = undefined;
    try {
      expect(joinWithOr(['a', 'b'], 'en')).toBe('a or b');
      expect(joinWithOr(['a', 'b', 'c'], 'en')).toBe('a, b, or c');
    } finally {
      intl.ListFormat = saved;
    }
  });
});

describe('how recent each kind must be', () => {
  it('takes the kind window over maxAgeDays over 90', () => {
    expect(poaKindDays(undefined, 'utility_bill')).toBe(90);
    expect(poaKindDays({ maxAgeDays: 180 }, 'utility_bill')).toBe(180);
    expect(poaKindDays({ maxAgeDays: 180, documentValidity: { utility_bill: 30 } }, 'utility_bill')).toBe(30);
    expect(poaKindDays({ documentValidity: { tenancy_agreement: 0 } }, 'tenancy_agreement')).toBe(0);
  });

  it('says it in months and years', () => {
    expect(poaPeriodLabel(90, defaultText)).toBe('3 months');
    expect(poaPeriodLabel(30, defaultText)).toBe('1 month');
    expect(poaPeriodLabel(365, defaultText)).toBe('1 year');
    expect(poaPeriodLabel(730, defaultText)).toBe('2 years');
    expect(poaPeriodLabel(0, defaultText)).toBe('Any date');
  });
});

describe('the submission', () => {
  function store(config: Record<string, unknown> = {}) {
    return createVerificationStore({
      apiKey: 'pk_test_x',
      country: 'NG',
      metadata: {},
      proofOfAddress: { enabled: true },
      ...config,
    } as unknown as ResolvedVerificationConfig);
  }

  it("sends the kind and the document's own country beside the upload", () => {
    const s = store();
    s.getState().setPoaDocumentType('bank_statement');
    s.getState().setProofOfAddress('media_1', 'bank_statement', 'statement.pdf');
    s.getState().setPoaCountry('GB');
    const req = buildVerifyRequest(s.getState(), undefined);
    expect(req.proofOfAddressType).toBe('bank_statement');
    expect(req.proofOfAddressCountry).toBe('GB');
  });

  it('sends neither without a document', () => {
    const s = store();
    s.getState().setPoaDocumentType('utility_bill');
    s.getState().setPoaCountry('GB');
    const req = buildVerifyRequest(s.getState(), undefined);
    expect(req.proofOfAddressType).toBeUndefined();
    expect(req.proofOfAddressCountry).toBeUndefined();
  });

  it('removing the document clears its kind', () => {
    const s = store();
    s.getState().setProofOfAddress('media_1', 'utility_bill', 'bill.jpg');
    s.getState().clearProofOfAddress();
    expect(s.getState().poaDocumentType).toBeNull();
    expect(s.getState().mediaIds.proofOfAddress).toBeUndefined();
  });
});

describe('the step', () => {
  it('asks for the country on every scope and the kind only when there is a choice', () => {
    const src = read('screens/ProofOfAddressStep.tsx');
    expect(src).not.toMatch(/scoped \?[^:]*<AddressCountryControl/);
    expect(src).toContain('<AddressCountryControl');
    expect(src).toMatch(/types\.length > 1 \? \(\s*<PoaAcceptedDocuments/);
    expect(src).toContain("scoped ? store.getState().setCountry(code) : store.getState().setPoaCountry(code)");
  });

  it('offers the capture the workflow asks for', () => {
    const parts = read('screens/ProofOfAddressParts.tsx');
    expect(parts).toMatch(/capture !== 'file' \?/);
    expect(parts).toMatch(/capture !== 'camera' \?/);
    expect(read('screens/ProofOfAddressStep.tsx')).toContain("const capture = poa?.capture ?? 'both'");
  });

  it('shows no requirement chips: the header already says name, address and date', () => {
    expect(read('screens/PoaRequirements.tsx')).not.toMatch(/requirement\./);
  });
});

describe('the country sheet pins the current answer', () => {
  const options = [
    { code: 'FR', name: 'France' },
    { code: 'GH', name: 'Ghana' },
    { code: 'NG', name: 'Nigeria' },
  ];
  const codes = (items: ReturnType<typeof buildDialCodeItems>['items']) =>
    items.map((i) => (i.kind === 'header' ? `#${i.region}` : i.option.code));

  it('puts Selected, then Your location, above the regions, each once', () => {
    const { selected, geo, items } = buildDialCodeItems(options, 'GH', true, 'FR');
    expect(selected?.code).toBe('FR');
    expect(geo?.code).toBe('GH');
    expect(codes(items)).toEqual(['FR', 'GH', '#Africa', 'NG']);
  });

  it('pins the location alone when it is the current answer', () => {
    const { selected, geo, items } = buildDialCodeItems(options, 'NG', true, 'NG');
    expect(selected?.code).toBe('NG');
    expect(geo).toBeNull();
    expect(codes(items)).toEqual(['NG', '#Africa', 'GH', '#Europe', 'FR']);
  });
});
