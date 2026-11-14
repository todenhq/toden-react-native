import React from 'react';
import { Platform, View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { StaggerIn } from '../../components/StaggerIn';
import type { IconName } from '../../components/Icon';
import { useText } from '../../i18n/useText';
import { nfcIntroCopy, type NfcIntroIcon } from '../../lib/nfcIntro';
import { AskHero, AskNextStep, AskReasons } from '../BackgroundAskParts';

/** The glyph for each row of the intro. */
const ICONS: Record<NfcIntroIcon, IconName> = {
  camera: 'camera',
  passport: 'book-user',
  card: 'id-card',
  phone: 'smartphone',
  hold: 'timer',
};

/**
 * What the chip read is and how to hold the document, before anything starts.
 * Laid out as the address-monitoring explanation is (SubmittedBackgroundAsk,
 * from the same parts): the hero, a title, the steps as one grouped card and
 * the "before you start" card over the button. The read used to start on
 * arrival, which only worked for people who already knew a passport's chip is
 * in its cover. Continue starts it (or the photo-page scan, when the code that
 * unlocks the chip is still needed).
 */
export function NfcIntro({
  passport,
  needsCode,
  onContinue,
}: {
  passport: boolean;
  needsCode: boolean;
  onContinue: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const copy = nfcIntroCopy({
    passport,
    needsCode,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other',
  });
  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <View style={{ height: spacing.md }} />
        <StaggerIn>
          <AskHero icon="nfc" />
        </StaggerIn>
        <View style={{ height: spacing.md }} />
        <StaggerIn delayMs={120}>
          <UiText variant="heading2" accessibilityRole="header">
            {copy.title}
          </UiText>
          <View style={{ height: spacing.xs }} />
          <UiText variant="bodyMedium" color={colors.textSecondary}>
            {copy.description}
          </UiText>
        </StaggerIn>
        <View style={{ height: spacing.lg }} />
        <StaggerIn delayMs={240}>
          <AskReasons reasons={copy.rows.map((r) => ({ ...r, icon: ICONS[r.icon] }))} />
        </StaggerIn>
      </View>

      <StaggerIn delayMs={360}>
        <AskNextStep steps={copy.before} />
        <View style={{ height: spacing.lg }} />
        <UiButton label={t('common.continue')} onPress={onContinue} />
      </StaggerIn>
    </View>
  );
}
