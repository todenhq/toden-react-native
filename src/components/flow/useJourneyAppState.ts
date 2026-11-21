import { useEffect } from 'react';
import { AppState } from 'react-native';

import { recordJourneyEvent } from '../../lib/step-log';

/**
 * The app leaving the screen and coming back while the flow is open (drop-off
 * insights). `inactive` (a permission sheet, Control Centre on iOS) is not
 * leaving; only `background` is, and the return is the next `active`.
 */
export function useJourneyAppState(): void {
  useEffect(() => {
    let away = false;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && !away) {
        away = true;
        recordJourneyEvent('app_backgrounded');
      } else if (next === 'active' && away) {
        away = false;
        recordJourneyEvent('app_foregrounded');
      }
    });
    return () => sub.remove();
  }, []);
}
