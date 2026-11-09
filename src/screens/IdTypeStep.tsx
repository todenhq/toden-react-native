import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useMultiIdPlan } from '../lib/use-multi-id-plan';
import type { IdType } from '../types/config';
import {
  useEffectiveCountry,
  useFlowState,
  useVerificationConfig,
  useVerificationStore,
  useTheme,
} from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiPulseLoader } from '../components/UiPulseLoader';
import { Icon, type IconName } from '../components/Icon';
import { countrySelectOptions, idCountryOnStep } from '../store/derive';
import { IdCountryField } from './IdCountryField';
import { useIdTypeOptions } from './useIdTypeOptions';

// ID-type picker — 1:1 with the web SDK's IdTypeStep and Flutter's
// IdTypeScreen: a list of cards (icon + label) that ADVANCE ON TAP. On the
// combined layout the country row sits above them (IdCountryField).
//
// No Continue button and no radio, matching Flutter and the web SDK. It is a
// single-select list with nothing else on the step to confirm, so Continue only
// restated a decision already made; and country-select already advances on tap,
// so a second list that behaved differently taught users one rule then broke
// it. A mis-tap costs one Back. No radio, then — it would imply a
// select-then-confirm this flow does not have — and no chevron either, as the
// web card has none.
//
// The advance reads the TAPPED value through the store, never the
// `selectedIdType` bound at render: that closure is a step behind inside the
// handler (and empty on the first selection), which would route a document ID
// to the number-only step. Going through `store.getState()` is what makes the
// write visible to `nextStep()`, since zustand commits synchronously.

const ICON_FOR: Record<string, IconName> = {
  bvn: 'landmark', // Bank Verification Number → bank/landmark
  nin: 'fingerprint',
  vnin: 'fingerprint',
  'nin-phone': 'fingerprint',
  'phone-number': 'smartphone',
  passport: 'passport',
  'drivers-license': 'id-card',
  pvc: 'contact', // Permanent Voter's Card
  'ghana-card': 'id-card',
  voters: 'contact',
  ssnit: 'id-card',
  'national-id': 'id-card',
  cni: 'id-card',
  'residence-card': 'id-card',
};

export function IdTypeStep(): React.ReactElement {
  const { colors } = useTheme();
  const config = useVerificationConfig();
  const country = useEffectiveCountry();
  const store = useVerificationStore();
  const serverConfig = useFlowState((s) => s.serverConfig);
  const selectedIdType = useFlowState((s) => s.selectedIdType);
  // The combined layout picks the country here, above the IDs, rather than on
  // a step of its own (lib/id-selection-layout.ts). One rule for this and the
  // header: store/derive.ts idCountryOnStep.
  const countryHere = useFlowState(idCountryOnStep);
  const countryOptions = useMemo(
    () => countrySelectOptions({ config, serverConfig }),
    [config, serverConfig],
  );
  // Multi-ID: this picker is for ONE check of several. It may only offer picks
  // that leave every later check something to offer — the server validates the
  // same rule, so an unsafe pick would be a submission it rejects.
  const plan = useMultiIdPlan();

  // Select AND advance in one tap. Both go through the store so `nextStep`
  // routes off the value just written — a document ID to document-capture, a
  // number-only ID to id-input.
  const pick = (key: IdType): void => {
    store.getState().setIdType(key);
    store.getState().nextStep();
  };

  // What this country offers, after every narrowing (screens/useIdTypeOptions.ts).
  const visible = useIdTypeOptions(country, plan);

  const countryField = countryHere ? (
    <View style={{ marginBottom: spacing.lg }}>
      <IdCountryField options={countryOptions} />
    </View>
  ) : null;

  if (serverConfig.status === 'loading') {
    return (
      <View>
        {countryField}
        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
          <UiPulseLoader />
        </View>
      </View>
    );
  }

  if (serverConfig.status === 'ready' && visible.length === 0) {
    return (
      <View>
        {countryField}
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.errorBg,
            borderWidth: 1,
            borderColor: `${colors.error}4D`,
          }}
        >
          <UiText variant="bodyMedium" color={colors.error}>
            No ID types are enabled for your organization. Contact your administrator to request access.
          </UiText>
        </View>
      </View>
    );
  }

  return (
    <View>
      {countryField}
      {visible.map((t) => {
        const selected = selectedIdType === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => pick(t.key)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={{
              // The web card: gap-3 between cards, rounded-xl, p-4, a 1px
              // border that turns primary when chosen.
              marginBottom: 12,
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.primary50 : colors.background,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              padding: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: colors.textDark,
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
            }}
          >
            {/* The glyph alone, no tile behind it: the card is the frame. */}
            <Icon name={ICON_FOR[t.key] ?? 'file-text'} size={40} color={selected ? colors.primary : colors.textSecondary} />
            <View style={{ width: 12 }} />
            <UiText variant="label" style={{ flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '500' }}>
              {t.label}
            </UiText>
          </Pressable>
        );
      })}
    </View>
  );
}
