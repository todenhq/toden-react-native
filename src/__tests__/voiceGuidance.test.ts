import { mergeVoiceGuidance, primaryLanguage, resolveVoiceGuidance } from '../config/voiceGuidance';
import { mergeWorkflowConfig } from '../config/workflowMerge';

// ─── The voiceGuidance setting ────────────────────────────────────────────────
//
// The contract (kyc-core docs/VOICE_GUIDANCE.md): a bare boolean is still
// accepted, an object may name a Toden voice, and the app's prop sits over the
// workflow's value key by key, the one workflow key where the prop wins.

describe('resolveVoiceGuidance', () => {
  it('still accepts a bare boolean', () => {
    // From 4.4.0 a Toden voice is the default (product owner, 2026-11-21).
    const automatic = { voice: undefined, deviceVoice: false, localVoice: 'any', localVoiceNeighbours: true };
    expect(resolveVoiceGuidance(true)).toEqual({ enabled: true, language: 'en-US', ...automatic });
    expect(resolveVoiceGuidance(false)).toEqual({ enabled: false, language: 'en-US', ...automatic });
    expect(resolveVoiceGuidance(undefined)).toEqual({ enabled: true, language: 'en-US', ...automatic });
  });

  it('reads the voice from an object', () => {
    expect(resolveVoiceGuidance({ voice: 'lyra' })).toMatchObject({ enabled: true, language: 'en-US', voice: 'lyra' });
    expect(resolveVoiceGuidance({ enabled: false, language: 'en-GB', voice: 'rory' })).toMatchObject({
      enabled: false,
      language: 'en-GB',
      voice: 'rory',
    });
  });

  it("reads the device's voice only where it was chosen, and matching as 'any' unless it says otherwise", () => {
    expect(resolveVoiceGuidance({ voice: 'device' })).toMatchObject({ voice: undefined, deviceVoice: true });
    expect(resolveVoiceGuidance({ localVoice: 'off', localVoiceNeighbours: false })).toMatchObject({ localVoice: 'off', localVoiceNeighbours: false });
    expect(resolveVoiceGuidance({ localVoice: 'random' as never }).localVoice).toBe('any');
  });

  it('treats an empty voice as none', () => {
    expect(resolveVoiceGuidance({ voice: '' }).voice).toBeUndefined();
  });
});

describe('mergeVoiceGuidance (the prop over the workflow)', () => {
  it('keeps the workflow value when there is no prop', () => {
    expect(mergeVoiceGuidance({ voice: 'lyra', language: 'en-GB' }, undefined)).toEqual({
      voice: 'lyra',
      language: 'en-GB',
    });
    expect(mergeVoiceGuidance(false, undefined)).toBe(false);
  });

  it('a prop voice keeps the workflow enabled and language', () => {
    expect(mergeVoiceGuidance({ enabled: true, language: 'en-GB', voice: 'lyra' }, { voice: 'rory' })).toEqual({
      enabled: true,
      language: 'en-GB',
      voice: 'rory',
    });
  });

  it('a bare boolean prop overrides enabled only', () => {
    expect(mergeVoiceGuidance({ language: 'en-GB', voice: 'lyra' }, false)).toEqual({
      enabled: false,
      language: 'en-GB',
      voice: 'lyra',
    });
  });

  it('a boolean workflow value is read as { enabled }', () => {
    expect(mergeVoiceGuidance(false, { voice: 'rory' })).toEqual({ enabled: false, voice: 'rory' });
  });

  it('an unset prop key never clears the workflow key', () => {
    expect(mergeVoiceGuidance({ voice: 'lyra' }, { voice: undefined, language: 'en-GB' })).toEqual({
      voice: 'lyra',
      language: 'en-GB',
    });
  });
});

describe('mergeWorkflowConfig and voiceGuidance', () => {
  it('lets the prop win key by key', () => {
    const merged = mergeWorkflowConfig(
      { voiceGuidance: { enabled: true, voice: 'lyra' } },
      { voiceGuidance: { voice: 'rory' } },
    );
    expect(merged.voiceGuidance).toEqual({ enabled: true, voice: 'rory' });
  });

  it('keeps the workflow value when the app sets none', () => {
    const merged = mergeWorkflowConfig<Record<string, unknown>>({ voiceGuidance: { voice: 'lyra' } }, {});
    expect(merged.voiceGuidance).toEqual({ voice: 'lyra' });
  });

  it('keeps the prop when the workflow sets none', () => {
    const merged = mergeWorkflowConfig({}, { voiceGuidance: false });
    expect(merged.voiceGuidance).toBe(false);
  });
});

describe('primaryLanguage', () => {
  it('is the primary subtag in lower case', () => {
    expect(primaryLanguage('en-US')).toBe('en');
    expect(primaryLanguage('EN_gb')).toBe('en');
    expect(primaryLanguage('fr')).toBe('fr');
  });
});
