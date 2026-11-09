import { readFileSync } from 'fs';
import { join } from 'path';

import { offeredPhoneOptions, startingPhoneCountry } from '../lib/phone-countries';

// The phone field offers only the workflow's dial-code countries
// (phoneVerification.countries), and shows one country fixed. Mirrors the
// web SDK's PhoneNumberInput.test.tsx (fee6c537).

const all = [
  { code: 'GH', dialCode: '+233' },
  { code: 'KE', dialCode: '+254' },
  { code: 'NG', dialCode: '+234' },
];

describe('the phone field countries', () => {
  it('offers every country when the workflow names none', () => {
    expect(offeredPhoneOptions(all, undefined)).toEqual(all);
    expect(offeredPhoneOptions(all, [])).toEqual(all);
  });

  it("offers only the workflow's, whatever their case", () => {
    expect(offeredPhoneOptions(all, ['gh', 'KE']).map((o) => o.code)).toEqual(['GH', 'KE']);
  });

  it('starts on a country the workflow offers when the default is not one', () => {
    expect(startingPhoneCountry('NG', offeredPhoneOptions(all, ['GH', 'KE']))).toBe('GH');
    expect(startingPhoneCountry('KE', offeredPhoneOptions(all, ['GH', 'KE']))).toBe('KE');
    expect(startingPhoneCountry('US', all)).toBe('NG');
  });

  it('shows one country fixed, with no picker, and keeps the code inside a late list', () => {
    const src = readFileSync(join(__dirname, '../components/PhoneNumberInput.tsx'), 'utf8');
    expect(src).toContain('const fixed = options.length === 1;');
    expect(src).toMatch(/\{fixed \? \(/);
    expect(src).toMatch(/if \(outside && firstOffered\) setCountry/);
    const field = readFileSync(join(__dirname, '../screens/ContactDestinationField.tsx'), 'utf8');
    expect(field).toContain('countries={config.phoneVerification?.countries}');
  });
});
