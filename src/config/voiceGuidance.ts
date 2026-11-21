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

export interface ResolvedVoiceGuidance {
  enabled: boolean;
  /** BCP-47 tag for the device voice, e.g. `en-US`. */
  language: string;
  /** A Toden voice id (e.g. `lyra`), or undefined for the device voice only. */
  voice: string | undefined;
}

/** Normalises the `voiceGuidance` config (bool | object | undefined) to an object. */
export function resolveVoiceGuidance(option: VoiceGuidanceOption | undefined): ResolvedVoiceGuidance {
  if (option === false) return { enabled: false, language: DEFAULT_VOICE_LANGUAGE, voice: undefined };
  if (option === true || option == null) return { enabled: true, language: DEFAULT_VOICE_LANGUAGE, voice: undefined };
  return {
    enabled: option.enabled !== false,
    language: option.language || DEFAULT_VOICE_LANGUAGE,
    voice: option.voice || undefined,
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
