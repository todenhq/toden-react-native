
import { applyAppCountry, stillOffered } from '../lib/app-country';

// A workflow that verifies IDs from Nigeria, Ghana and Kenya, opening on
// Nigeria, as it reaches the rule: already merged over the app's props, so its
// `country` is the workflow's own.
const flow = {
  country: 'NG',
  countries: [{ country: 'NG', idTypes: ['nin'] }, { country: 'GH', idTypes: ['ghana-card'] }, { country: 'KE' }],
};

describe('applyAppCountry', () => {
  it('opens the picker on the country the app passed, keeping every country on offer', () => {
    const out = applyAppCountry(flow, 'GH');
    expect(out).toMatchObject({ country: 'GH', appCountry: 'GH' });
    expect(out.countries).toHaveLength(3);
  });

  it('offers that country alone when locked, with its own ID types, so no picker shows', () => {
    const out = applyAppCountry({ ...flow, lockCountry: true }, ' gh ');
    expect(out.country).toBe('GH');
    expect(out.countries).toEqual([{ country: 'GH', idTypes: ['ghana-card'] }]);
  });

  it('changes nothing for a country the flow does not offer, locked or not: the picker shows as usual', () => {
    expect(applyAppCountry(flow, 'ZA')).toBe(flow);
    const locked = { ...flow, lockCountry: true };
    expect(applyAppCountry(locked, 'ZA')).toBe(locked);
  });

  it('changes nothing when the app passed no country, even with the lock set', () => {
    const locked = { ...flow, lockCountry: true };
    expect(applyAppCountry(locked, undefined)).toBe(locked);
    expect(applyAppCountry(flow, '  ')).toBe(flow);
  });

  it('leaves a single-country flow alone: there `country` is the flow\'s own, as before', () => {
    const single = { country: 'NG', countries: [{ country: 'NG' }], lockCountry: true };
    expect(applyAppCountry(single, 'GH')).toBe(single);
    const propsOnly = { country: 'NG' };
    expect(applyAppCountry(propsOnly, 'NG')).toBe(propsOnly);
  });

  it('marks the country the app passed even when it is the one the workflow opens on anyway', () => {
    expect(applyAppCountry(flow, 'NG')).toMatchObject({ country: 'NG', appCountry: 'NG' });
  });
});

describe('stillOffered', () => {
  it('keeps a saved country the flow still offers, whatever its case', () => {
    expect(stillOffered('GH', flow)).toBe(true);
    expect(stillOffered('gh', flow)).toBe(true);
  });

  it('drops a saved country once the flow is locked to another', () => {
    const locked = applyAppCountry({ ...flow, lockCountry: true }, 'GH');
    expect(stillOffered('NG', locked)).toBe(false);
    expect(stillOffered('GH', locked)).toBe(true);
  });

  it('takes any country on a flow that lists none', () => {
    expect(stillOffered('NG', {})).toBe(true);
    expect(stillOffered('NG', { countries: [] })).toBe(true);
  });
});


describe('resuming a saved session', () => {
  it('does not restore progress saved in a country the flow no longer offers', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'store', 'session.ts'), 'utf8');
    expect(source).toContain("if (typeof d['selectedCountry'] === 'string' && !stillOffered(d['selectedCountry'], s.config)) return;");
  });
});
