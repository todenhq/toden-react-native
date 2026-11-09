import { STEP_TEXTS } from '../i18n/step-texts';
import { DEFAULT_TEXTS } from '../i18n/defaults';
import { BUSINESS_VARIANT_TEXTS } from '../i18n/business-variants';
import { defaultText } from '../i18n/translate';
import { describeInMonorepo, readPackageFile as read } from './helpers/monorepo';

// ─── The non-customisable texts of the redesigned steps, against web ─────────
//
// The Proof of Address step, the combined ID country row and the business
// country row read keys the web SDK added on 2026-11-07. They are not in the
// shared customisable list, so this SDK keeps them in i18n/step-texts.ts; the
// keys and their wording must still be the web SDK's, byte for byte.

const WEB_GROUPS = [
  'sdk-react/src/i18n/groups/proofOfAddress.ts',
  'sdk-react/src/i18n/groups/selectDocument.ts',
  'sdk-react/src/i18n/groups/business-country.ts',
  'sdk-react/src/i18n/groups/business-details.ts',
  'sdk-react/src/i18n/groups/presence-capture.ts',
  'sdk-react/src/i18n/groups/welcome-process.ts',
  'sdk-react/src/i18n/groups/contact.ts',
];

/** key → default, read out of the web group sources. */
function webDefaults(): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of WEB_GROUPS) {
    const src = read(rel);
    const entry = /key:\s*'([^']+)'[\s\S]*?default:\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/g;
    for (const m of src.matchAll(entry)) {
      out.set(m[1]!, (m[2] ?? m[3] ?? '').replace(/\\(['"])/g, '$1'));
    }
  }
  return out;
}

describeInMonorepo('step texts mirror the web SDK', () => {
  it('every key is a web key with the web wording', () => {
    const web = webDefaults();
    const drift = Object.entries(STEP_TEXTS)
      .filter(([key, text]) => web.get(key) !== text)
      .map(([key, text]) => `${key}: ours ${JSON.stringify(text)}, web ${JSON.stringify(web.get(key))}`);
    expect(drift).toEqual([]);
  });

  it('the business caption for the PoA country is the web one', () => {
    const web = webDefaults();
    expect(BUSINESS_VARIANT_TEXTS['proofOfAddress.country.residence.business']).toBe(
      web.get('proofOfAddress.country.residence.business'),
    );
  });
});

describe('step texts', () => {
  it('are not customisable keys, and carry no em dash', () => {
    expect(Object.keys(STEP_TEXTS).filter((k) => k in DEFAULT_TEXTS)).toEqual([]);
    expect(Object.values(STEP_TEXTS).filter((v) => v.includes('—'))).toEqual([]);
  });

  it('resolve through t()', () => {
    expect(defaultText('proofOfAddress.accepted.open')).toBe('See accepted documents');
    expect(defaultText('proofOfAddress.validity.months', { count: 3 })).toBe('3 months');
    expect(defaultText('selectDocument.combined.title')).toBe('Choose your ID');
  });
});
