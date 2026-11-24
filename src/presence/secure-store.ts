// ---------------------------------------------------------------------------
// expo-secure-store, when the host has it: device-only storage for the
// presence secrets (the user token, the HMAC presenceToken, the device
// registration). AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY keeps them out of iCloud
// and device-transfer backups and lets background code read them while the
// phone is locked after its first unlock. An optional peer, loaded with the
// require-in-try pattern of fs.ts, and asked about first: loading the package
// without its native module is fatal in a release build
// (native-module-present.ts).
// ---------------------------------------------------------------------------

import { nativeModulePresent } from '../lib/native-module-present';

export interface SecureStoreLike {
  getItemAsync(key: string, options?: Record<string, unknown>): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
  deleteItemAsync(key: string, options?: Record<string, unknown>): Promise<void>;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: unknown;
}

export function secureStore(): SecureStoreLike | null {
  if (!nativeModulePresent('ExpoSecureStore')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-secure-store') as Partial<SecureStoreLike>;
    return typeof mod?.getItemAsync === 'function' ? (mod as SecureStoreLike) : null;
  } catch {
    return null;
  }
}

export function deviceOnly(store: SecureStoreLike): Record<string, unknown> {
  return store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY !== undefined
    ? { keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    : {};
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs secure-store work one piece at a time, in the order it was asked for,
 * so a "forget" fired by a new pin can never land after the token saved for it.
 */
export function serially<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}
