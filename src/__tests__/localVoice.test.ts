import { pickVoice, voiceSeedNumber, type ManifestVoice, type VoiceManifest } from '../liveness/voicePhrases';
import { voiceApplicant } from '../liveness/voiceApplicant';

// Who speaks, from 4.4.0 (kyc-core docs/VOICE_GUIDANCE.md): a Toden voice from
// the country of the document being verified, else a neighbouring country's,
// else the workflow's own voice, else an American one. The same rule, and the
// same seed numbers, as the web and Flutter SDKs.

const voice = (country: string | undefined, gender: 'female' | 'male', extra: Partial<ManifestVoice> = {}): ManifestVoice => ({
  languages: ['en'],
  gender,
  ...(country ? { country } : {}),
  offered: true,
  ...extra,
});

const BOOK: VoiceManifest = {
  version: 'v1',
  voices: {
    tolani: voice('NG', 'female'),
    chinedu: voice('NG', 'male'),
    rose: voice('NG', 'female'),
    obinna: voice('NG', 'male'),
    keith: voice('KE', 'male'),
    maryanne: voice('KE', 'female'),
    nakato: voice('UG', 'female'),
    lyra: voice('GB', 'female'),
    elise: voice('US', 'female'),
    danny: voice('US', 'male'),
    marlon: voice(undefined, 'male'),
  },
  neighbours: { TZ: ['KE', 'UG'], RW: ['UG', 'KE'] },
  fallbackCountry: 'US',
  phrases: { en: { 'presence.challenge.nod': 'Nod your head' } },
};

const who = (choice: 'female' | 'male' | 'any' | 'off', country: string | null, workflowVoice?: string, seed = 'person-1', neighbours = true) =>
  pickVoice(BOOK, { voice: workflowVoice, language: 'en-US', applicant: { choice, country, seed, neighbours } });

describe('a voice from the person\'s own country', () => {
  it('gives a Kenyan a Kenyan voice and a Nigerian a Nigerian one, of the gender asked for', () => {
    expect(who('female', 'KE')).toBe('maryanne');
    expect(who('male', 'KE')).toBe('keith');
    expect(['tolani', 'rose']).toContain(who('female', 'NG'));
    expect(['chinedu', 'obinna']).toContain(who('male', 'ng'));
  });

  it('keeps one person on one voice, and spreads people across a country\'s voices', () => {
    expect(who('any', 'NG', undefined, 'p')).toBe(who('any', 'NG', undefined, 'p'));
    expect(new Set(Array.from({ length: 200 }, (_, n) => who('any', 'NG', undefined, `person-${n}`)))).toEqual(
      new Set(['tolani', 'chinedu', 'rose', 'obinna']),
    );
  });

  it('keeps the accent when the country has no voice of that gender', () => {
    expect(who('male', 'UG')).toBe('nakato');
  });

  it('never gives a voice Toden no longer offers', () => {
    const withdrawn = { ...BOOK, voices: { ...BOOK.voices, maryanne: voice('KE', 'female', { offered: false }) } };
    expect(pickVoice(withdrawn, { language: 'en', applicant: { choice: 'female', country: 'KE', seed: 's' } })).toBe('keith');
  });
});

describe('a neighbouring voice', () => {
  it('gives a Tanzanian a Kenyan voice, and takes the first neighbour with the gender asked for', () => {
    expect(who('female', 'TZ')).toBe('maryanne');
    expect(who('male', 'RW')).toBe('keith');
    expect(who('female', 'RW')).toBe('nakato');
  });

  it('is skipped when switched off', () => {
    expect(who('female', 'TZ', 'lyra', 'p', false)).toBe('lyra');
  });
});

describe('the fallbacks', () => {
  it("gives the workflow's own voice, then an American one", () => {
    expect(who('any', 'SN', 'lyra')).toBe('lyra');
    expect(who('female', 'SN')).toBe('elise');
    expect(who('male', 'SN')).toBe('danny');
    expect(who('female', null)).toBe('elise');
  });

  it('with matching off: the workflow\'s own voice, else an American one, whatever the country', () => {
    expect(who('off', 'KE', 'lyra')).toBe('lyra');
    expect(['danny', 'elise']).toContain(who('off', 'KE'));
  });

  it("chooses nothing from an older server that says nothing of countries: the device's voice", () => {
    const older: VoiceManifest = { version: 'v1', voices: { lyra: { languages: ['en'] } }, phrases: BOOK.phrases };
    expect(pickVoice(older, { language: 'en', applicant: { choice: 'any', country: 'KE', seed: 's' } })).toBeNull();
    expect(pickVoice(older, { voice: 'lyra', language: 'en', applicant: { choice: 'any', country: 'KE', seed: 's' } })).toBe('lyra');
  });

  it('an accent that is not one country\'s is never anybody\'s local voice', () => {
    expect(who('male', 'JM', 'lyra')).toBe('lyra');
  });
});

describe('who the prompts are for', () => {
  it('numbers a seed the same way every Toden SDK does (FNV-1a)', () => {
    expect(voiceSeedNumber('')).toBe(0x811c9dc5);
    expect(voiceSeedNumber('a')).toBe(0xe40c292c);
  });

  it('names the person by the app\'s user reference, and leaves the country out when matching is off', () => {
    const guidance = { localVoice: 'any' as const, localVoiceNeighbours: true };
    expect(voiceApplicant(guidance, { country: 'ke', userId: 'user-9' })).toEqual({ choice: 'any', country: 'KE', seed: 'user-9', neighbours: true });
    expect(voiceApplicant({ ...guidance, localVoice: 'off' }, { country: 'KE', userId: 'user-9' }).country).toBeUndefined();
    // Without a user reference, one seed for the whole app session.
    expect(voiceApplicant(guidance, {}).seed).toBe(voiceApplicant(guidance, {}).seed);
  });
});
