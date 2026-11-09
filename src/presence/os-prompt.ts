import { AppState, Platform } from 'react-native';

import { osShowedPrompt } from './os-prompt-rule';

// ---------------------------------------------------------------------------
// One permission request, and the truth about it.
//
// On iOS the request's own answer cannot be trusted. expo-location can resolve
// "denied" while the prompt is still on screen, when its delegate fires early,
// and the state change saying a prompt went up reaches JavaScript after that
// answer does. Read at that moment the prompt looks absent, and the person gets
// Settings opened on top of it. So a refusal waits: if the app leaves the
// active state a prompt is up, and the permission is read again once it closes.
// ---------------------------------------------------------------------------

/** How long iOS gets to put a prompt up. Past expo-location's own 1.5s. */
export const PROMPT_WAIT_MS = 2500;
/** iOS applies the choice a moment after the prompt closes. */
export const PROMPT_SETTLE_MS = 400;
/** A prompt left open this long is abandoned, never waited on for good. */
const PROMPT_OPEN_MS = 5 * 60 * 1000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withPromptWatch<T extends { status: string } | null>(
  ask: () => Promise<T>,
  read: () => Promise<T>,
): Promise<{ result: T; prompted: boolean }> {
  const startedAt = Date.now();
  const ios = Platform.OS === 'ios';
  let leftActive = false;
  let onChange: (active: boolean) => void = () => undefined;
  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') leftActive = true;
    onChange(state === 'active');
  });
  try {
    const result = await ask();
    const elapsedMs = Date.now() - startedAt;
    if (result?.status === 'granted') return { result, prompted: true };
    if (!ios) {
      return { result, prompted: osShowedPrompt({ platform: 'android', leftActive, elapsedMs }) };
    }
    if (!leftActive) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.max(0, PROMPT_WAIT_MS - elapsedMs));
        onChange = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
    if (!leftActive) return { result, prompted: false };
    if (AppState.currentState !== 'active') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, PROMPT_OPEN_MS);
        onChange = (active) => {
          if (!active) return;
          clearTimeout(timer);
          resolve();
        };
      });
    }
    await delay(PROMPT_SETTLE_MS);
    return { result: await read(), prompted: true };
  } finally {
    sub.remove();
  }
}
