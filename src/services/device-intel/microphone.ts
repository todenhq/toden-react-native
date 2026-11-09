import { deviceIntelNative } from './native';

/**
 * Whether the host app declared the microphone. False when it cannot tell,
 * which includes a native build older than this method: audio is then skipped,
 * and skipping is always safe, where asking undeclared closes the app on iOS.
 */
export function microphoneDeclared(): boolean {
  try {
    return deviceIntelNative()?.declaresMicrophone() === true;
  } catch {
    return false;
  }
}

/** One go at the microphone. Every failure is a silent clip, never a stop. */
export async function askForMicrophone(input: {
  hasPermission: boolean;
  declared: () => boolean;
  request: () => Promise<boolean>;
}): Promise<boolean> {
  if (input.hasPermission) return true;
  if (!input.declared()) return false;
  try {
    return await input.request();
  } catch {
    return false;
  }
}
