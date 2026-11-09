import { withoutNinBesideSlip, withoutNinBesideSlipRows } from '../lib/nin-slip';
import { offeredIdTypeRows } from '../lib/offered-id-types';
import { ID_TYPES } from '../config/idTypes';

// NIN and its slip are one ID since 2026-11-07. Mirrors the web SDK's
// lib/nin-slip.test.ts.

const ids = (...keys: string[]) => keys.map((key) => ({ key }));

describe('NIN and its slip', () => {
  it('offers only the slip when a workflow lists both', () => {
    expect(withoutNinBesideSlip('NG', ids('bvn', 'nin', 'nin-slip'))).toEqual(ids('bvn', 'nin-slip'));
  });

  it('leaves NIN alone without the slip, and other countries alone', () => {
    expect(withoutNinBesideSlip('NG', ids('bvn', 'nin'))).toEqual(ids('bvn', 'nin'));
    expect(withoutNinBesideSlip('GH', ids('nin', 'nin-slip'))).toEqual(ids('nin', 'nin-slip'));
  });

  it('applies to the served rows the flow offers, NG only', () => {
    const rows = [
      { country: 'NG', idType: 'nin' },
      { country: 'NG', idType: 'nin-slip' },
      { country: 'GH', idType: 'nin' },
    ];
    expect(withoutNinBesideSlipRows(rows)).toEqual([rows[1], rows[2]]);
    expect(offeredIdTypeRows(rows, { country: 'NG' }).map((r) => `${r.country}/${r.idType}`)).toEqual([
      'NG/nin-slip',
      'GH/nin',
    ]);
    expect(withoutNinBesideSlipRows([rows[0]!])).toEqual([rows[0]]);
  });

  it('labels the slip as NIN (Slip)', () => {
    expect(ID_TYPES.NG.find((t) => t.key === 'nin-slip')?.label).toBe('NIN (Slip)');
  });
});
