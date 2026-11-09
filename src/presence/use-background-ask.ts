import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';

import { autoReportPresence, wantsBackground, type AutoReportConfig } from './auto-report';
import { backgroundPresenceRegistered, enableBackgroundPresence } from './background';
import { backgroundPrimerDecision } from './background-primer';
import { afterAllow } from './os-prompt-rule';
import { openLocationSettings } from './status';
import { markBackgroundAsked } from './store';

// ---------------------------------------------------------------------------
// The submitted step's side of the "allow all the time" ask
// (background-primer.ts). After a successful submission `begin()` decides:
// show the explanation screen first (`'ask'`), or go straight to the success
// screen, having armed silently when the permission is already granted. The
// answer then rides to the success card as `outcome`: `'on'`, `'off'` (they
// said no or not now), or null (nothing was asked). From `'off'` the card can
// open Settings; returning with the permission granted arms it and flips the
// card, with no second prompt.
// ---------------------------------------------------------------------------

export type BackgroundOutcome = 'on' | 'off' | null;

const PERMISSION_WATCH_MS = 1000;

function optionsOf(config: AutoReportConfig) {
  return {
    apiKey: config.apiKey,
    externalUserId: config.userId!,
    ...(config.devUrl ? { devUrl: config.devUrl } : {}),
  };
}

async function alwaysGranted(): Promise<boolean> {
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return bg?.status === 'granted';
}

export type BackgroundAsk = ReturnType<typeof useBackgroundAsk>;

export function useBackgroundAsk(config: AutoReportConfig) {
  const [outcome, setOutcome] = useState<BackgroundOutcome>(null);
  // Read before the screen shows, so what it says the phone will ask is right
  // on its first frame.
  const [foregroundGranted, setForegroundGranted] = useState(true);
  // The phone's answer could not be seen: the screen stays, offers Settings,
  // and watches the permission itself.
  const [settingsOffer, setSettingsOffer] = useState(false);
  const awaitingSettings = useRef(false);

  /** After the submission: `'ask'` shows the screen, `'success'` skips it. */
  const begin = useCallback(async (resumed: boolean): Promise<'ask' | 'success'> => {
    const wants = wantsBackground(config);
    const decision = backgroundPrimerDecision({
      wantsBackground: wants,
      registered: wants && backgroundPresenceRegistered(),
      alwaysGranted: wants ? await alwaysGranted() : false,
      resumed,
    });
    if (decision === 'primer') {
      const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
      setForegroundGranted(fg?.status === 'granted');
      void autoReportPresence(config, {}, { background: false });
      return 'ask';
    }
    // Silent arms with no prompt; skip makes no background ask at all.
    void autoReportPresence(config);
    if (decision === 'silent') setOutcome('on');
    return 'success';
  }, [config]);

  /** From the success card: the app's settings, where "all the time" lives. */
  const openSettings = useCallback(() => {
    awaitingSettings.current = true;
    void openLocationSettings('app');
  }, []);

  /** The person tapped allow: the OS prompt, then the answer. */
  const allow = useCallback(async () => {
    markBackgroundAsked(config.userId!);
    const result = await enableBackgroundPresence(optionsOf(config)).catch(() => null);
    const next = afterAllow(result);
    if (next === 'offer') setSettingsOffer(true);
    else setOutcome(next);
    return next;
  }, [config]);

  const later = useCallback(() => {
    setSettingsOffer(false);
    setOutcome('off');
  }, []);

  // The one reliable sign: the permission itself. It covers a prompt answered
  // late and a trip to Settings alike, whatever the app's state did meanwhile.
  useEffect(() => {
    if (!settingsOffer) return undefined;
    let checking = false;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void (async () => {
        if (await alwaysGranted()) {
          clearInterval(timer);
          // Already granted, so this arms the fence with no prompt.
          const result = await enableBackgroundPresence(optionsOf(config)).catch(() => null);
          setSettingsOffer(false);
          setOutcome(result?.enabled ? 'on' : 'off');
        }
        checking = false;
      })();
    }, PERMISSION_WATCH_MS);
    return () => clearInterval(timer);
  }, [settingsOffer, config]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingSettings.current) return;
      awaitingSettings.current = false;
      void (async () => {
        if (!(await alwaysGranted())) return;
        // Already granted, so this arms the fence with no prompt.
        const result = await enableBackgroundPresence(optionsOf(config)).catch(() => null);
        if (result?.enabled) setOutcome('on');
      })();
    });
    return () => sub.remove();
  }, [config]);

  return { outcome, foregroundGranted, settingsOffer, begin, allow, later, openSettings };
}
