// ---------------------------------------------------------------------------
// Did the OS actually show a permission prompt?
//
// A refusal can mean two opposite things. Either the person answered, which is
// final, or the OS showed nothing at all: iOS asks for "Always" once per
// install and never after "Allow Once", and Android stops after two refusals.
// Both come back as "denied". Only Settings can help the second person, and
// they tapped a button expecting something to happen, so the caller sends them
// there rather than treating the silence as their answer.
//
// A prompt takes an iOS app out of the active state. Android gives no such
// signal, but no person answers a dialog within half a second.
// ---------------------------------------------------------------------------

const QUICKEST_ANSWER_MS = 500;

export function osShowedPrompt(input: {
  platform: 'ios' | 'android';
  leftActive: boolean;
  elapsedMs: number;
}): boolean {
  if (input.leftActive) return true;
  return input.platform === 'android' && input.elapsedMs >= QUICKEST_ANSWER_MS;
}

/** A refusal the OS gave without asking, so Settings is the only way forward. */
export function needsSettings(result: { reason: string; osPrompted?: boolean } | null): boolean {
  if (!result || result.osPrompted !== false) return false;
  return result.reason === 'foreground_denied' || result.reason === 'background_denied';
}

/**
 * Where a tap on "turn on" leads. `'offer'` keeps the screen and offers
 * Settings as the person's own choice. Settings is never opened for them: the
 * signal behind `osPrompted` has read "no prompt" with the prompt on screen, and
 * a prompt blocks touches, so a button is harmless behind one where a jump to
 * Settings is not.
 */
export function afterAllow(result: { enabled: boolean; reason: string; osPrompted?: boolean } | null): 'on' | 'off' | 'offer' {
  if (result?.enabled) return 'on';
  return needsSettings(result) ? 'offer' : 'off';
}
