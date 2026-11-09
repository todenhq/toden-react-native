/**
 * `expo-document-picker`, loaded on demand.
 *
 * A static import runs the module's native lookup at MODULE load, which throws
 * `Cannot find native module 'ExpoDocumentPicker'` on any host app that has not
 * rebuilt to pick it up — taking down the whole SDK, including flows that never
 * choose a file. Requiring it at the moment the user taps means the capability
 * degrades to photo-only where it is unavailable, matching the null-degrade
 * posture the platform uses for every other optional native dependency.
 */
import { UPLOAD_HINT, UPLOAD_HINT_PHOTOS } from '../config/uploadLimits';
import { nativeModulePresent } from '../lib/native-module-present';

export type DocumentPickerModule = typeof import('expo-document-picker');

type NativeLookup = Parameters<typeof nativeModulePresent>[1];

/**
 * Whether this build can open the file picker. Read while drawing a screen, so
 * it must never load the package; it only asks Expo whether the native half is
 * there.
 */
export function documentPickerAvailable(lookup?: NativeLookup): boolean {
  return nativeModulePresent('ExpoDocumentPicker', lookup);
}

/** The line under a drop zone, saying only what this build can actually attach. */
export function documentUploadHint(lookup?: NativeLookup): string {
  return documentPickerAvailable(lookup) ? UPLOAD_HINT : UPLOAD_HINT_PHOTOS;
}

export function loadDocumentPicker(): DocumentPickerModule | null {
  if (!documentPickerAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-document-picker') as DocumentPickerModule;
  } catch {
    return null;
  }
}
