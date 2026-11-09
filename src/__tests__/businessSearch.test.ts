import { readFileSync } from 'fs';
import { join } from 'path';

import {
  BUSINESS_SEARCH_REFUSALS,
  businessSearchQuery,
  businessSearchRefusal,
  nameSearchOffered,
  businessPickView,
} from '../config/businessSearch';
import { BUSINESS_DOCUMENT_LABELS } from '../config/businessSteps';
import { getBusinessProductDef } from '../config/business';
import { registrationNumberHint } from '../config/registrationHint';
import { businessDetailsValid } from '../config/businessDetailsValidity';
import { VerificationApiError } from '../services/api';
import type { BusinessDocumentKey } from '../types/business';

// ─── Search by company name ───────────────────────────────────────────────────
//
// Some registers charge per search, so the request carries the attempt session
// and the server may refuse; a refusal moves the applicant to number entry,
// never to "no matches". Ported from the web SDK's lib/business-search.test.ts.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('business search request', () => {
  it('sends the attempt session, the same id the register check sends', () => {
    const qs = new URLSearchParams(
      businessSearchQuery({ country: 'GH', query: 'Acme', limit: 50, sessionId: 'sess_1' }),
    );
    expect(qs.get('sessionId')).toBe('sess_1');
    expect(qs.get('country')).toBe('GH');
    expect(qs.get('limit')).toBe('50');
  });

  it('leaves the session out when there is none', () => {
    const qs = new URLSearchParams(businessSearchQuery({ country: 'NG', query: 'Acme', sessionId: null }));
    expect(qs.has('sessionId')).toBe(false);
  });

  it('is what the API client and the search screen send', () => {
    expect(read('services/api.ts')).toContain('/business/search?${businessSearchQuery(params)}');
    expect(read('screens/BusinessSearch.tsx')).toMatch(/businessSearch\(\{[\s\S]*sessionId,[\s\S]*\}\)/);
  });
});

describe('business search refusals', () => {
  const err = (code: string, message?: string): VerificationApiError =>
    new VerificationApiError(message ?? 'x', 400, code, message ? { error: code, message } : { error: code });

  it('moves the applicant to number entry on every refusal, with the server message', () => {
    for (const code of [
      'business_search_disabled',
      'session_required',
      'insufficient_credits',
      'search_limit_reached',
      'pricing_not_configured',
    ]) {
      expect(BUSINESS_SEARCH_REFUSALS).toContain(code);
      expect(businessSearchRefusal(err(code, 'Enter the registration number.'))).toEqual({
        code,
        message: 'Enter the registration number.',
      });
    }
    expect(businessSearchRefusal(err('session_required'))).toEqual({ code: 'session_required', message: null });
  });

  it('keeps the search for an outage or a throttle, which can be retried', () => {
    expect(businessSearchRefusal(err('search_unavailable'))).toBeNull();
    expect(businessSearchRefusal(err('search_rate_limited'))).toBeNull();
    expect(businessSearchRefusal(new Error('network'))).toBeNull();
  });

  it('is acted on by the search screen and the details step', () => {
    expect(read('screens/BusinessSearch.tsx')).toContain('onRefused(refusal.message)');
    expect(read('screens/BusinessDetailsStep.tsx')).toMatch(/onRefused=\{[\s\S]*setSearchRefused\(/);
  });
});

describe('workflow switch for search by name', () => {
  it('is on unless the workflow switched it off', () => {
    expect(nameSearchOffered(undefined)).toBe(true);
    expect(nameSearchOffered({ nameSearch: true })).toBe(true);
    expect(nameSearchOffered({ nameSearch: false })).toBe(false);
  });

  it('opens the details step on number entry and never mounts the search when off', () => {
    const step = read('screens/BusinessDetailsStep.tsx');
    // Read on every render; the first screen asks for the number, and Continue
    // fills the second from the register.
    expect(step).toContain('const view = businessPickView({');
    expect(step).toMatch(/phase === 'pick' && view\.numberEntry/);
    expect(step).not.toMatch(/useState<'pick' \| 'details'>\(\(\) =>/);
    expect(step).toMatch(/\{searchOn \? \(\s*<View[\s\S]*<BusinessSearch/);
  });

  it('holds Continue until a split register has its region', () => {
    const base = {
      phase: 'pick' as const,
      business: { registrationName: '' } as never,
      modes: {} as never,
      product: 'business',
      numberValid: true,
      nameRequired: false,
      showContactEmail: false,
    };
    expect(businessDetailsValid({ ...base, regionMissing: true })).toBe(false);
    expect(businessDetailsValid({ ...base, regionMissing: false })).toBe(true);
  });
});

describe('business document labels', () => {
  const NEW_KEYS: Record<string, string> = {
    business_registration: 'Business registration certificate',
    good_standing_certificate: 'Certificate of good standing',
    registry_extract: 'Official company extract or profile from the registrar',
    annual_return: 'Latest annual return',
    register_of_directors: 'Register of directors',
    shareholder_register: 'Register of shareholders',
    share_certificate: 'Share certificate',
    ubo_declaration: 'Beneficial ownership declaration',
    power_of_attorney: 'Power of attorney',
    authorization_letter: 'Letter of authorisation',
    financial_statements: 'Financial statements or audited accounts',
  };

  it('labels every key the server catalogue may send', () => {
    for (const [key, label] of Object.entries(NEW_KEYS)) {
      expect(BUSINESS_DOCUMENT_LABELS[key as BusinessDocumentKey]).toBe(label);
    }
    expect(Object.keys(BUSINESS_DOCUMENT_LABELS)).toHaveLength(18);
    expect(BUSINESS_DOCUMENT_LABELS.memart).toBe('Memorandum and articles / company constitution');
    expect(BUSINESS_DOCUMENT_LABELS.tax_document).toBe('Tax registration or clearance certificate');
    expect(BUSINESS_DOCUMENT_LABELS.regulatory_license).toBe('Regulatory licence or permit');
  });
});

describe('Ghana registration numbers', () => {
  it('uses the Registrar of Companies prefixes', () => {
    const gh = registrationNumberHint('GH', getBusinessProductDef('business'));
    expect(gh.placeholder).toBe('e.g. CS043840225');
    expect(gh.tip).toMatch(/CS for a company, BN for a business name or PL for a public company/);
    expect(gh.isValidFormat).toBeNull();
  });
});

describe('the first screen of the business step', () => {
  const view = (o: Partial<Parameters<typeof businessPickView>[0]>) =>
    businessPickView({ searchOffered: true, refused: false, manualEntry: false, picked: false, ...o });

  it('asks for the registration number when search is off, refused or skipped', () => {
    for (const o of [{ searchOffered: false }, { refused: true }, { manualEntry: true }]) {
      expect(view(o)).toEqual({ numberEntry: true, search: false, card: false });
      expect(view({ ...o, picked: true })).toEqual({ numberEntry: true, search: false, card: false });
    }
  });

  it('shows the search, then the card once a company is named', () => {
    expect(view({})).toEqual({ numberEntry: false, search: true, card: false });
    expect(view({ picked: true })).toEqual({ numberEntry: false, search: false, card: true });
  });
});
