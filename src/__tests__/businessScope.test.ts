import { buildStepOrder, type StepOrderOptions } from '../config/stepOrder';
import { isBusinessFlow } from '../config/business';
import { contactMeta } from '../config/contact';
import { proofOfAddressMeta, questionnaireMeta } from '../components/stepHeaderCopy';
import { buildConsentModel } from '../screens/consent/model';
import {
  BUSINESS_SCOPES,
  isScopedBusiness,
  unsupportedScopeConfig,
} from '../lib/scope';
import { BUSINESS_VARIANT_TEXTS, businessKey, businessVariantBase } from '../i18n/business-variants';
import { createTextFn, defaultText } from '../i18n/translate';
import { DEFAULT_TEXTS } from '../i18n/defaults';
import type { VerificationConfig } from '../types/config';
import { mapToVerificationError } from '../services/errors';
import { VerificationApiError } from '../services/api';

// ─── Scoped BUSINESS workflows ────────────────────────────────────────────────
//
// A business may carry the address, questionnaire or contact scope. The scope
// decides the steps (never the KYB application), the screens name the
// business, and a biometric scope on a business is refused. Mirrors the web
// SDK's lib/business-scope.test.ts.

const business = { country: 'NG' } as never;

const options = (over: Partial<StepOrderOptions> = {}): StepOrderOptions => ({
  isBusiness: false,
  hasDocCapture: true,
  hasNfc: false,
  hasLiveness: true,
  hasCountrySelect: false,
  hasEmailVerification: false,
  hasPhoneVerification: false,
  hasPoa: false,
  hasSupportingDocuments: false,
  hasAddressCollection: false,
  hasQuestionnaire: false,
  ...over,
});

const config = (over: Partial<VerificationConfig>): VerificationConfig =>
  ({ apiKey: 'pk_test_x', country: 'NG', subjectType: 'business', ...over }) as VerificationConfig;

describe('which flow a scoped business workflow runs', () => {
  it('knows the scopes a business may carry', () => {
    expect([...BUSINESS_SCOPES].sort()).toEqual(['address', 'contact', 'questionnaire']);
  });

  it('never enters the KYB application once a scope is set', () => {
    expect(isBusinessFlow({ subjectType: 'business', business })).toBe(true);
    for (const scope of BUSINESS_SCOPES) {
      expect(isBusinessFlow({ subjectType: 'business', business, scope })).toBe(false);
    }
  });

  it('refuses a business workflow with a biometric scope, and nothing else', () => {
    expect(unsupportedScopeConfig({ subjectType: 'business', scope: 'biometric-authentication' })).toBe(true);
    expect(unsupportedScopeConfig({ subjectType: 'business', scope: 'biometric-enrollment' })).toBe(true);
    expect(unsupportedScopeConfig({ subjectType: 'individual', scope: 'biometric-enrollment' })).toBe(false);
    expect(unsupportedScopeConfig({ subjectType: 'business', scope: 'contact' })).toBe(false);
    expect(isScopedBusiness({ subjectType: 'business', scope: 'biometric-enrollment' })).toBe(false);
  });

  it('builds the scope order even when told the flow is a business', () => {
    expect(
      buildStepOrder(options({ isBusiness: true, business, scope: 'questionnaire', hasQuestionnaire: true })),
    ).toEqual(['consent', 'questionnaire', 'submitted']);
    expect(buildStepOrder(options({ isBusiness: true, business, scope: 'contact', hasPhoneVerification: true }))).toEqual([
      'consent',
      'phone-verification',
      'submitted',
    ]);
    const address = buildStepOrder(options({ isBusiness: true, business, scope: 'address', hasPoa: true }));
    expect(address).toEqual(['consent', 'proof-of-address', 'submitted']);
  });
});

describe('business wording on scoped screens', () => {
  it('every business variant stands in for a text this SDK shows', () => {
    for (const variant of Object.keys(BUSINESS_VARIANT_TEXTS)) {
      const base = businessVariantBase(variant)!;
      expect(`${base}.business`).toBe(variant);
      expect(BUSINESS_VARIANT_TEXTS[variant]).not.toContain('—');
      // Not a customisable key itself: it inherits the base text instead.
      expect(variant in DEFAULT_TEXTS).toBe(false);
    }
    expect(businessKey('contact.email.title', true)).toBe('contact.email.title.business');
    expect(businessKey('contact.email.title', false)).toBe('contact.email.title');
  });

  it("lets the org's words for the base text win over the business default", () => {
    const custom = createTextFn({ en: { 'contact.email.title': 'Confirm the address' } });
    expect(custom('contact.email.title.business')).toBe('Confirm the address');
    expect(defaultText('contact.email.title.business')).toBe('Verify your business email');
  });

  it('titles the consent screen and lists the business steps', () => {
    const m = buildConsentModel(
      config({ scope: 'address', addressCollection: { enabled: true }, proofOfAddress: { enabled: true } } as never),
    );
    expect(m.title).toBe('Business Address Verification');
    expect(m.description).toMatch(/where your business operates/);
    expect(m.isBusiness).toBe(true); // the legal notice names business data
    const labels = m.steps.map((s) => s.label);
    expect(labels).toContain('Verify your business premises');
    expect(labels).toContain("Upload a document showing your business's address");
    expect(labels).not.toContain('Collect your business registration details');
    expect(m.capturesFace).toBe(false);

    expect(buildConsentModel(config({ scope: 'contact' } as never)).title).toBe(
      'Confirm Your Business Contact Details',
    );
    // A person keeps their own wording.
    expect(buildConsentModel(config({ subjectType: 'individual', scope: 'contact' } as never)).title).toBe(
      'Confirm Your Contact Details',
    );
  });

  it('words the step headers for the business', () => {
    expect(contactMeta('email', undefined, defaultText, true).title).toBe('Verify your business email');
    expect(contactMeta('phone', undefined, defaultText, true).description).toMatch(/belongs to your business/);
    expect(questionnaireMeta(undefined, undefined, defaultText, true).title).toBe('A few questions about your business');
    expect(questionnaireMeta('Our questions', undefined, defaultText, true).title).toBe('Our questions');
    expect(proofOfAddressMeta(90, true, defaultText, true).description).toBe(
      "Upload a document that shows your business's name and address, issued within the last 90 days.",
    );
  });
});

describe('a reference naming the other kind of record', () => {
  it('is a configuration error, not something a retry fixes', () => {
    const err = mapToVerificationError(
      new VerificationApiError('This reference belongs to an individual.', 422, 'entity_type_mismatch'),
      'verify',
    );
    expect(err.code).toBe('invalid_workflow');
    expect(err.message).toMatch(/different kind of record/);
  });
});
