import { readFileSync } from 'fs';
import { join } from 'path';

import { countryOnIdStep } from '../lib/id-selection-layout';
import { withoutUnchosenIdTypes } from '../lib/chosen-only-ids';
import { isRetiredIdType } from '../lib/retired-id-types';
import { offeredIdTypeRows } from '../lib/offered-id-types';
import { buildStepOrder } from '../config/stepOrder';
import { WORKFLOW_KEYS, mergeWorkflowConfig } from '../config/workflowMerge';
import { countrySelectOptions, idCountryOnStep, stepOrderOptions } from '../store/derive';
import { INITIAL_SERVER_CONFIG } from '../store/serverConfig';
import type { VerificationState } from '../store/state';

// Picking the ID: where the country is picked (user decision 2026-11-07), and
// which IDs are offered at all. Mirrors the web SDK's id-selection-layout,
// chosen-only-ids and retired-id-types tests.

describe('where the country is picked', () => {
  it('is on the ID-type step unless the workflow keeps a step of its own', () => {
    expect(countryOnIdStep({})).toBe(true);
    expect(countryOnIdStep({ idSelectionLayout: 'combined' })).toBe(true);
    expect(countryOnIdStep({ idSelectionLayout: 'separate' })).toBe(false);
  });

  it('rides the workflow merge like the other ID keys', () => {
    expect(WORKFLOW_KEYS).toContain('idSelectionLayout');
    expect(mergeWorkflowConfig({ idSelectionLayout: 'separate' }, { idSelectionLayout: 'combined' }).idSelectionLayout).toBe(
      'separate',
    );
  });

  const state = (config: Record<string, unknown>): VerificationState =>
    ({
      config: { countries: [{ country: 'NG' }, { country: 'GH' }], ...config },
      serverConfig: INITIAL_SERVER_CONFIG,
      selectedIdType: null,
      selectedCountry: null,
      multiIdSlots: [],
      multiIdSlotIndex: 0,
      businessApplication: { applicantRole: null, applicantName: '', applicantKeyPersonIndex: null },
      addressBookReuse: null,
    }) as unknown as VerificationState;

  it('drops the country step on the combined layout and keeps it on separate', () => {
    expect(buildStepOrder(stepOrderOptions(state({})))).not.toContain('country-select');
    expect(buildStepOrder(stepOrderOptions(state({ idSelectionLayout: 'separate' })))).toContain('country-select');
  });

  it('puts the country on the ID step only where there is a choice', () => {
    expect(idCountryOnStep(state({}))).toBe(true);
    expect(idCountryOnStep(state({ idSelectionLayout: 'separate' }))).toBe(false);
    expect(idCountryOnStep(state({ countries: [{ country: 'NG' }] }))).toBe(false);
    expect(idCountryOnStep({ ...state({}), multiIdSlotIndex: 1 })).toBe(false);
  });

  it('the ID step and the header read the one rule', () => {
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
    expect(read('screens/IdTypeStep.tsx')).toContain('useFlowState(idCountryOnStep)');
    expect(read('components/VerificationFlow.tsx')).toContain('idCountryOnStep(state)');
    expect(read('components/stepHeaderMeta.tsx')).toContain("'selectDocument.combined.title'");
  });
});

const rows = ['bvn', 'nin', 'tax-id', 'vnin', 'passport'].map((idType) => ({ country: 'NG', idType }));
const keys = (list: Array<{ idType: string }>) => list.map((r) => r.idType);

describe('chosen-only IDs in a workflow', () => {
  it('leaves them out of a country that lists no IDs', () => {
    expect(keys(withoutUnchosenIdTypes(rows, { countries: [{ country: 'NG' }] }))).toEqual(['bvn', 'nin', 'passport']);
  });

  it('keeps one the country lists by name', () => {
    expect(keys(withoutUnchosenIdTypes(rows, { countries: [{ country: 'NG', idTypes: ['bvn', 'vnin'] }] }))).toContain(
      'vnin',
    );
    expect(keys(withoutUnchosenIdTypes(rows, { country: 'NG', idTypes: ['tax-id'] }))).toContain('tax-id');
  });

  it('applies on a workflow mount only: a mount configured in code lists its own', () => {
    expect(keys(offeredIdTypeRows(rows, { workflowId: 'wf_1', country: 'NG' }))).toEqual(['bvn', 'nin', 'passport']);
    expect(keys(offeredIdTypeRows(rows, { country: 'NG' }))).toEqual(keys(rows));
  });
});

describe('retired ID types', () => {
  it('names BVN Premium retired, and BVN not', () => {
    expect(isRetiredIdType('NG', 'bvn-premium')).toBe(true);
    expect(isRetiredIdType('ng', 'bvn')).toBe(false);
  });

  it('is never offered, on any mount, but its definition stays', () => {
    const served = [...rows, { country: 'NG', idType: 'bvn-premium' }];
    expect(keys(offeredIdTypeRows(served, { country: 'NG' }))).not.toContain('bvn-premium');
    expect(keys(offeredIdTypeRows(served, { workflowId: 'wf_1' }))).not.toContain('bvn-premium');
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
    expect(read('config/idTypes.ts')).toContain("key: 'bvn-premium'");
    expect(read('screens/useIdTypeOptions.ts')).toContain('isRetiredIdType(country, t.key)');
  });

  it('leaves a country whose only IDs are retired out of the country list', () => {
    const serverConfig = {
      ...INITIAL_SERVER_CONFIG,
      status: 'ready' as const,
      idTypes: [
        { country: 'NG', idType: 'bvn-premium' },
        { country: 'GH', idType: 'ghana-card' },
      ] as never,
    };
    expect(countrySelectOptions({ config: {} as never, serverConfig })).toEqual(['GH']);
  });
});
