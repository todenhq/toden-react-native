import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { spacing } from '../config/theme';
import { useTheme, useVerificationConfig } from '../components/runtime';
import { useText } from '../i18n/useText';
import { UiText } from '../components/Typography';
import { UiButton } from '../components/UiButton';
import { StaggerIn } from '../components/StaggerIn';
import {
  confirmWithinDays,
  effortSentence,
  effortWithoutBackground,
  withinSentence,
} from '../presence/background-primer';
import { backgroundAllowSteps, backgroundSettingsSteps } from '../presence/background-allow-steps';
import { openLocationSettings } from '../presence/status';
import type { BackgroundAsk } from '../presence/use-background-ask';
import { AskHero, AskNextStep, AskReasons, type AskReason } from './BackgroundAskParts';

// ─── The "allow all the time" screen ────────────────────────────────────────
//
// Shown once, right after a flow with presence monitoring is submitted and
// immediately before the OS prompt, because that prompt is roughly a one-time
// chance (presence/background-primer.ts). It gives the person THEIR reasons,
// each one true of how the check works: less effort (the count is the real one
// for this workflow's policy, at the server's weighting), done sooner, and
// only this address. "Not now" still finishes the flow; the success card then
// offers the switch again. Mirrors the Flutter SDK's background_ask_screen.dart.

export function SubmittedBackgroundAsk({
  ask,
  onDone,
}: {
  ask: Pick<BackgroundAsk, 'allow' | 'later' | 'foregroundGranted' | 'settingsOffer' | 'outcome'>;
  /** The person answered (either way): on to the success screen. */
  onDone: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const config = useVerificationConfig();
  const t = useText();
  const [busy, setBusy] = useState(false);
  const business = config.subjectType === 'business';
  const policy = config.addressCollection?.presence;
  const effort = effortWithoutBackground(policy, business);

  const reasons: AskReason[] = [
    { icon: 'check', title: 'Nothing more to do', caption: effortSentence(effort, business) },
    { icon: 'timer', title: 'Done sooner', caption: withinSentence(confirmWithinDays(policy)) },
    {
      icon: 'shield',
      title: 'Only this address',
      caption: business
        ? 'We only check whether your phone is at the premises. We never see where else you go.'
        : 'We only check whether your phone is at this address. We never see where else you go.',
    },
  ];
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const steps = ask.settingsOffer
    ? backgroundSettingsSteps(platform)
    : backgroundAllowSteps({
        platform,
        ...(Platform.OS === 'android' ? { androidApi: Number(Platform.Version) } : {}),
        foregroundGranted: ask.foregroundGranted,
      });

  // The permission arrived while Settings was on offer: nothing left to ask.
  useEffect(() => {
    if (ask.settingsOffer === false && ask.outcome === 'on') onDone();
  }, [ask.settingsOffer, ask.outcome, onDone]);

  const allow = async () => {
    if (busy) return;
    setBusy(true);
    let next: 'on' | 'off' | 'offer' = 'off';
    try {
      next = await ask.allow();
    } finally {
      setBusy(false);
      if (next === 'off') onDone();
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: spacing.lg }}>
      <View>
        <View style={{ height: spacing.md }} />
        <StaggerIn>
          <AskHero />
        </StaggerIn>
        <View style={{ height: spacing.md }} />
        <StaggerIn delayMs={120}>
          <UiText variant="heading2" accessibilityRole="header">
            {t(business ? 'address.background.title.business' : 'address.background.title')}
          </UiText>
          <View style={{ height: spacing.xs }} />
          <UiText variant="bodyMedium" color={colors.textSecondary}>
            {t(business ? 'address.background.description.business' : 'address.background.description')}
          </UiText>
        </StaggerIn>
        <View style={{ height: spacing.lg }} />
        <StaggerIn delayMs={240}>
          <AskReasons reasons={reasons} />
        </StaggerIn>
      </View>

      <StaggerIn delayMs={360}>
        <AskNextStep steps={steps} />
        <View style={{ height: spacing.lg }} />
        {ask.settingsOffer ? (
          <UiButton label="Open Settings" onPress={() => void openLocationSettings('app')} />
        ) : (
          <UiButton label={t('address.background.allow')} loading={busy} onPress={() => void allow()} />
        )}
        <View style={{ height: spacing.xs }} />
        <UiButton
          variant="ghost"
          label={t('address.background.later')}
          labelColor={colors.textSecondary}
          disabled={busy}
          onPress={() => { ask.later(); onDone(); }}
        />
      </StaggerIn>
    </View>
  );
}
