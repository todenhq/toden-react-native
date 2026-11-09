import type { KeyPersonEntry } from '../config/keyPeople';
import { keyPeopleRequireOwnership, rowMissingStake } from '../config/keyPersonStake';
import { isKeyPersonRowValid } from '../config/keyPeople';

const row = (over: Partial<KeyPersonEntry>): KeyPersonEntry =>
  ({ name: 'Ama Mensah', role: 'shareholder', roles: ['shareholder'], email: '', country: '', ownershipPct: '', title: '', isCorporate: false, registrationNumber: '', owners: [], ...over }) as KeyPersonEntry;

describe('the stake a key person must state', () => {
  it('is required of owners by default, and off when the workflow says so', () => {
    const kp = { enabled: true, collect: true };
    expect(keyPeopleRequireOwnership({ keyPeople: kp } as never)).toBe(true);
    expect(keyPeopleRequireOwnership({ keyPeople: { ...kp, requireOwnership: false } } as never)).toBe(false);
    expect(keyPeopleRequireOwnership({ keyPeople: { enabled: true } } as never)).toBe(false);
  });

  it('blocks a shareholder or beneficial owner without one, never a director', () => {
    expect(rowMissingStake(row({}), true)).toBe(true);
    expect(rowMissingStake(row({ roles: ['director', 'beneficial_owner'], role: 'beneficial_owner' }), true)).toBe(true);
    expect(rowMissingStake(row({ ownershipPct: '30' }), true)).toBe(false);
    expect(rowMissingStake(row({ roles: ['director'], role: 'director' }), true)).toBe(false);
    expect(rowMissingStake(row({}), false)).toBe(false);
    expect(isKeyPersonRowValid(row({}), new Set(), true)).toBe(false);
    expect(isKeyPersonRowValid(row({}), new Set(), false)).toBe(true);
  });

  it('asks a company for each named owner’s share', () => {
    const corp = row({ isCorporate: true, ownershipPct: '40', owners: [{ name: 'Kwame', ownershipPct: '', email: '', country: '' }] as never });
    expect(rowMissingStake(corp, true)).toBe(true);
  });
});
