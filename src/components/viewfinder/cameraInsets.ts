import { Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

// The safe insets the full-screen cameras (the document scan and photo mode)
// lay their controls out from. Both run in a full-screen modal under the
// status bar and the home indicator.

/** Status-bar clearance for the top bar. */
export function cameraTopInset(): number {
  return Platform.OS === 'ios' ? 56 : 32;
}

/** Home-indicator / nav-bar clearance for the bottom row. */
export function cameraBottomInset(): number {
  const sa = initialWindowMetrics?.insets;
  if (Platform.OS === 'android') return (sa?.bottom ?? 0) + 12;
  return sa?.bottom || 34;
}
