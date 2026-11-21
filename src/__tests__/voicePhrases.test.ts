import {
  manifestHasVoice,
  normalisePhrase,
  parseVoiceManifest,
  phraseKeyMap,
  voiceClipUrl,
  voiceManifestUrl,
  type VoiceManifest,
} from '../liveness/voicePhrases';
import {
  CHALLENGE_PASSED_LINE,
  FACE_LOST_LINE,
  FLASH_HOLD_INSTRUCTION,
  INTEGRITY_FAILED_PATCH,
  MULTIPLE_FACES_GUIDANCE,
  POSITION_OFF_CENTRE,
  POSITION_TOO_CLOSE,
  POSITION_TOO_FAR,
  TIMEOUT_LINE,
  lightingSpokenText,
  positionGuidanceText,
} from '../liveness/livenessState';
import { challengeInstruction, placeFaceInstruction } from '../liveness/types';
import { FLASH_RETRY_GUIDANCE } from '../liveness/flashOutcome';
import { CAPTURE_HOLD_STILL } from '../liveness/captureGuidance';
import { defaultText } from '../i18n/translate';

// ─── Matching a line to a Toden voice clip ────────────────────────────────────
//
// A clip plays only for the exact text it was recorded from, after one
// normalising rule shared by the three SDKs (kyc-core docs/VOICE_GUIDANCE.md).

/** The contract's phrase table, key to text. */
const CONTRACT: Record<string, string> = {
  'presence.position.placeFace': 'Position your face in the circle',
  'presence.position.moveCloser': 'Move closer',
  'presence.position.moveAway': 'Move further away',
  'presence.position.centerFace': 'Centre your face',
  'presence.position.lookStraight': 'Look straight at the camera',
  'presence.position.holdStill': 'Hold still',
  'presence.position.comeBack': 'Move back into position',
  'presence.position.multipleFaces': 'Make sure only your face is visible',
  'presence.lighting.tooDark': 'Move to a brighter area',
  'presence.lighting.tooBright': 'Too bright. Reduce the glare',
  'presence.challenge.nod': 'Nod your head',
  'presence.challenge.turn': 'Turn your head',
  'presence.challenge.blink': 'Blink your eyes',
  'presence.challenge.smile': 'Smile',
  'presence.challenge.hold': 'Hold still and look at the camera',
  'presence.challenge.flash': 'Hold still. The screen will flash briefly',
  'presence.challenge.passed': 'Good.',
  'presence.flash.retry': 'Move away from bright light and hold still',
  'presence.capture.retake': 'Hold still, taking that again',
  'presence.capture.complete': 'Capture complete',
  'presence.failed.timeout': "Time's up. Please try again.",
  'presence.failed.faceLost': 'Face lost. Please try again.',
  'presence.failed.restart': "Let's start over. Please stay in frame.",
  'presence.failed.check': "We couldn't confirm the check. Let's try again.",
};

const MANIFEST: VoiceManifest = {
  version: '3f9a1c2b',
  voices: { lyra: { languages: ['en'] }, rory: { languages: ['en'] } },
  phrases: { en: CONTRACT },
};

describe('normalisePhrase', () => {
  it('matches the punctuation and case variants of one line', () => {
    expect(normalisePhrase('Hold still…')).toBe('hold still');
    expect(normalisePhrase('Hold still.')).toBe('hold still');
    expect(normalisePhrase('hold still')).toBe('hold still');
  });

  it('straightens curly apostrophes and keeps them', () => {
    expect(normalisePhrase('Let’s start over. Please stay in frame.')).toBe("let's start over please stay in frame");
    expect(normalisePhrase("Time's up. Please try again.")).toBe("time's up please try again");
  });

  it('collapses runs of spaces and trims', () => {
    expect(normalisePhrase('  Move   closer  ')).toBe('move closer');
  });

  it('keeps letters beyond ASCII', () => {
    expect(normalisePhrase('Écoutez, s’il vous plaît !')).toBe("écoutez s'il vous plaît");
  });

  it('folds compatibility forms (NFKC)', () => {
    expect(normalisePhrase('Ｈｏｌｄ still')).toBe('hold still');
  });
});

describe('the manifest', () => {
  it('builds the URLs on the server it is given', () => {
    expect(voiceManifestUrl('https://api.toden.co/')).toBe('https://api.toden.co/api/kyc/assets/voices/manifest.json');
    expect(voiceClipUrl('https://api.toden.co', MANIFEST, 'lyra', 'en', 'presence.challenge.nod')).toBe(
      'https://api.toden.co/api/kyc/assets/voices/3f9a1c2b/lyra/en/presence.challenge.nod.mp3',
    );
  });

  it('reads a manifest and refuses anything else', () => {
    expect(parseVoiceManifest(MANIFEST)).toEqual(MANIFEST);
    expect(parseVoiceManifest({ error: 'not_found' })).toBeNull();
    expect(parseVoiceManifest(null)).toBeNull();
    expect(parseVoiceManifest({ version: 'x', voices: {}, phrases: { en: { a: 1 } } })).toBeNull();
  });

  it('knows which voice and language it has clips for', () => {
    expect(manifestHasVoice(MANIFEST, 'lyra', 'en')).toBe(true);
    expect(manifestHasVoice(MANIFEST, 'lyra', 'fr')).toBe(false);
    expect(manifestHasVoice(MANIFEST, 'nobody', 'en')).toBe(false);
  });

  it('maps normalised text to the key', () => {
    const map = phraseKeyMap(MANIFEST, 'en');
    expect(map.get(normalisePhrase('Hold still…'))).toBe('presence.position.holdStill');
    expect(map.get(normalisePhrase('Good.'))).toBe('presence.challenge.passed');
    expect(map.size).toBe(Object.keys(CONTRACT).length);
    expect(phraseKeyMap(MANIFEST, 'fr').size).toBe(0);
  });
});

describe('every line this SDK speaks by default has a clip', () => {
  const map = phraseKeyMap(MANIFEST, 'en');
  const spoken: Array<[string, string]> = [
    [placeFaceInstruction(), 'presence.position.placeFace'],
    [positionGuidanceText(POSITION_TOO_FAR), 'presence.position.moveCloser'],
    [positionGuidanceText(POSITION_TOO_CLOSE), 'presence.position.moveAway'],
    [positionGuidanceText(POSITION_OFF_CENTRE), 'presence.position.centerFace'],
    [defaultText('presence.position.lookStraight'), 'presence.position.lookStraight'],
    [defaultText('presence.position.moveCloser'), 'presence.position.moveCloser'],
    [CAPTURE_HOLD_STILL, 'presence.position.holdStill'],
    [MULTIPLE_FACES_GUIDANCE, 'presence.position.multipleFaces'],
    [lightingSpokenText('dark'), 'presence.lighting.tooDark'],
    [lightingSpokenText('bright'), 'presence.lighting.tooBright'],
    [challengeInstruction('nod'), 'presence.challenge.nod'],
    [challengeInstruction('turn'), 'presence.challenge.turn'],
    [challengeInstruction('blink'), 'presence.challenge.blink'],
    [challengeInstruction('smile'), 'presence.challenge.smile'],
    [challengeInstruction('hold'), 'presence.challenge.hold'],
    [FLASH_HOLD_INSTRUCTION, 'presence.challenge.flash'],
    [CHALLENGE_PASSED_LINE, 'presence.challenge.passed'],
    [FLASH_RETRY_GUIDANCE, 'presence.flash.retry'],
    [TIMEOUT_LINE, 'presence.failed.timeout'],
    [FACE_LOST_LINE, 'presence.failed.faceLost'],
    [INTEGRITY_FAILED_PATCH.instruction, 'presence.failed.restart'],
  ];

  it.each(spoken)('%s', (text, key) => {
    expect(map.get(normalisePhrase(text))).toBe(key);
  });

  it('a reworded line has none', () => {
    expect(map.get(normalisePhrase('Kindly nod your head'))).toBeUndefined();
  });
});
