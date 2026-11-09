import React from 'react';
import { View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useFlowState, useVerificationConfig, useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiButton } from '../components/UiButton';
import { Icon } from '../components/Icon';
import { buildConsentModel } from './consent/model';
import { ConsentLegalNotice } from './consent/ConsentLegalNotice';
import { ConsentEmblem } from './consent/ConsentEmblem';
import { ConsentJourney } from './consent/ConsentJourney';
import { useText } from '../i18n/useText';
import { resubmitNote } from '../lib/resubmit';

// Consent / welcome screen, 1:1 with the web SDK's ConsentStep (redesigned
// 2026-11-08): Toden's mark on a muted square, the greeting, a calm
// description with how long the flow takes, the steps as an inset grouped
// list, the derived legal notice, Continue, lock footer.
// Everything the screen SAYS — title, description, step list, the biometric
// sentence — is derived in consent/model.ts from what the flow actually does,
// so a KYB flow gets the business copy and never claims an ID/selfie step it
// doesn't run. The header title is intentionally empty for this step; the
// screen owns its hero.

export function ConsentStep(): React.ReactElement {
  const { colors } = useTheme();
  const config = useVerificationConfig();
  const nextStep = useFlowState((s) => s.nextStep);
  const t = useText();

  const { isBusiness, title, description, steps, capturesFace, recordsVideo } =
    buildConsentModel(config, t);

  // A reviewer sent this applicant back. Say so, and say why — the note is the
  // only thing on screen that explains a flow which has silently lost most of
  // its steps. Above the hero so it is read before the instructions.
  const redoNote = resubmitNote(config.resubmit);

  return (
    <View>
      <View style={{ height: spacing.sm }} />

      {redoNote ? (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: `${colors.warning}66`,
            backgroundColor: colors.warningBg,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Icon name="refresh" size={16} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <UiText variant="bodyMedium" color={colors.warning}>
              A few things to redo
            </UiText>
            <UiText variant="bodySmall" color={colors.textSecondary}>
              {redoNote}
            </UiText>
          </View>
        </View>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <ConsentEmblem />
      </View>

      <View style={{ height: spacing.md }} />
      <UiText variant="heading1" style={{ textAlign: 'center', fontWeight: '600' }}>
        {title}
      </UiText>
      <View style={{ height: spacing.sm }} />
      <UiText
        variant="bodyMedium"
        color={colors.textSecondary}
        style={{ textAlign: 'center', lineHeight: 21, maxWidth: 384, alignSelf: 'center' }}
      >
        {description}
      </UiText>
      <View style={{ height: spacing.lg }} />

      <ConsentJourney steps={steps} heading={t('welcome.process.heading')} />

      <View style={{ height: spacing.lg }} />

      {/* The legal notice, directly above the button it describes. */}
      <View style={{ borderRadius: 12, backgroundColor: `${colors.backgroundSecondary}80`, paddingHorizontal: 14, paddingVertical: 12 }}>
        <ConsentLegalNotice isBusiness={isBusiness} capturesFace={capturesFace} recordsVideo={recordsVideo} />
      </View>

      <View style={{ height: spacing.md }} />
      {/* No arrow: Continue gives consent, it does not point anywhere. */}
      <UiButton label={t('common.continue')} onPress={nextStep} />
      <View style={{ height: spacing.sm }} />

      {/* Footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={13} color={colors.textMuted} />
        <View style={{ width: 6 }} />
        {/* flexShrink so a wide brand font wraps this instead of clipping it —
            a Text in a row without it overflows rather than wrapping. */}
        <UiText variant="bodySmall" style={{ flexShrink: 1 }}>
          {t('welcome.secureNote')}
        </UiText>
      </View>
    </View>
  );
}
