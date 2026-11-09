import { readFileSync } from 'fs';
import { join } from 'path';

import { poaCountryOf, poaOfferedCountries } from '../lib/poa-country-gate';
import { poaCountryFor } from '../store/derive';
import { ALL_REGION_CODES } from '../config/regions';

// The Proof of Address step's country (user decisions 2026-09-08 and
// 2026-11-07). Mirrored on web and Flutter.
describe('poaCountryOf', () => {
  const world = ['NG', 'GH', 'GB'];
  const facts = { scope: null, selectedCountry: null, poaCountry: null, idCountry: null, offered: world };

  it('starts from the ID country outside the address scope, and a pick replaces it', () => {
    expect(poaCountryOf({ ...facts, selectedCountry: 'NG', idCountry: 'NG' })).toBe('NG');
    expect(poaCountryOf({ ...facts, selectedCountry: 'NG', idCountry: 'NG', poaCountry: 'GB' })).toBe('GB');
  });

  it('does not start from an ID country the org does not accept', () => {
    expect(poaCountryOf({ ...facts, idCountry: 'KE' })).toBeNull();
  });

  it('on the address scope only the declared country counts', () => {
    expect(poaCountryOf({ ...facts, scope: 'address', selectedCountry: 'gh' })).toBe('GH');
    expect(poaCountryOf({ ...facts, scope: 'address', idCountry: 'NG', poaCountry: 'NG' })).toBeNull();
    expect(poaCountryOf({ ...facts, scope: 'address', selectedCountry: ' ' })).toBeNull();
  });

  it('one accepted country is a settled fact, not a choice', () => {
    expect(poaCountryOf({ ...facts, scope: 'address', offered: ['NG'] })).toBe('NG');
    expect(poaCountryOf({ ...facts, offered: ['NG'] })).toBe('NG');
  });

  it('the offered list is the org list, unknown codes dropped, else the world', () => {
    expect(poaOfferedCountries(['ng', 'ZZ'])).toEqual(['NG']);
    expect(poaOfferedCountries(undefined)).toBe(ALL_REGION_CODES);
  });

  it('reads the flow state the same way: the workflow country is the ID country', () => {
    const config = { country: 'NG', proofOfAddress: { enabled: true } } as never;
    expect(poaCountryFor({ config, selectedCountry: null, poaCountry: null })).toBe('NG');
    expect(poaCountryFor({ config, selectedCountry: 'GH', poaCountry: 'GB' })).toBe('GB');
  });

  it('the PoA step gates Continue on it', () => {
    const src = readFileSync(join(__dirname, '../screens/ProofOfAddressStep.tsx'), 'utf8');
    expect(src).toContain('useFlowState(poaCountryFor)');
    expect(src).toMatch(/disabled=\{!mediaId \|\| busy \|\| !poaCountry\}/);
  });
});
