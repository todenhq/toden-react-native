// ---------------------------------------------------------------------------
// The `voiceGuidance` setting: what it resolves to, and how the consumer's prop
// sits over a workflow's value.
//
// The contract is kyc-core docs/VOICE_GUIDANCE.md, shared with the web and
// Flutter SDKs. A bare boolean means `{ enabled: <boolean> }`, and every key
// this SDK does not know is ignored, so a newer workflow never breaks it.
// ---------------------------------------------------------------------------

import type { VoiceGuidanceConfig, VoiceGuidanceOption } from '../types/appearance';

export const DEFAULT_VOICE_LANGUAGE = 'en-US';

/** The `voice` that means the device's own speech, chosen by the admin. */
export const DEVICE_VOICE_ID = 'device';

export type LocalVoiceSetting = 'female' | 'male' | 'any' | 'off';

export interface ResolvedVoiceGuidance {
  enabled: boolean;
  /** BCP-47 tag for the device voice, e.g. `en-US`. */
  language: string;
  /** The workflow's own Toden voice (e.g. `lyra`), or undefined for none. */
  voice: string | undefined;
  /** The admin chose the device's own voice: no Toden voice speaks. */
  deviceVoice: boolean;
  /** How a voice is matched to the person's country; `off` skips their country and its neighbours. */
  localVoice: LocalVoiceSetting;
  /** A neighbouring country's voice where their own has none. */
  localVoiceNeighbours: boolean;
}

/**
 * Normalises the `voiceGuidance` config (bool | object | undefined). From
 * 4.4.0 a Toden voice speaks unless the admin chose the device's
 * (`voice: 'device'`): kyc-core docs/VOICE_GUIDANCE.md, "Who speaks".
 */
export function resolveVoiceGuidance(option: VoiceGuidanceOption | undefined): ResolvedVoiceGuidance {
  const object = typeof option === 'object' && option !== null ? option : {};
  const named = typeof object.voice === 'string' && object.voice ? object.voice : undefined;
  const deviceVoice = named === DEVICE_VOICE_ID;
  const local = object.localVoice;
  return {
    enabled: typeof option === 'boolean' ? option : object.enabled !== false,
    language: object.language || DEFAULT_VOICE_LANGUAGE,
    voice: deviceVoice ? undefined : named,
    deviceVoice,
    localVoice: local === 'female' || local === 'male' || local === 'off' ? local : 'any',
    localVoiceNeighbours: object.localVoiceNeighbours !== false,
  };
}

/** The object form of a stored or supplied value; anything unreadable is empty. */
function asConfig(value: unknown): VoiceGuidanceConfig {
  if (typeof value === 'boolean') return { enabled: value };
  if (value && typeof value === 'object') return value as VoiceGuidanceConfig;
  return {};
}

/** The keys of `config` that are set, so an absent key never clears the workflow's. */
function definedKeys(config: VoiceGuidanceConfig): VoiceGuidanceConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as VoiceGuidanceConfig;
}

/**
 * The consumer's prop over the workflow's value, key by key: a prop
 * `{ voice: 'rory' }` keeps the workflow's `enabled` and `language`, and a bare
 * boolean prop overrides `enabled` only. With no prop the workflow's value
 * stands as it was stored.
 */
export function mergeVoiceGuidance(
  workflowValue: unknown,
  prop: VoiceGuidanceOption | undefined,
): VoiceGuidanceOption | undefined {
  if (prop === undefined) return workflowValue as VoiceGuidanceOption | undefined;
  const overlay = typeof prop === 'boolean' ? { enabled: prop } : definedKeys(prop);
  return { ...asConfig(workflowValue), ...overlay };
}

/** The primary subtag of a BCP-47 tag, lower case: `en-US` is `en`. */
export function primaryLanguage(tag: string): string {
  return (tag.split(/[-_]/)[0] ?? '').toLowerCase();
}
