import React from 'react';
import { Pressable, View } from 'react-native';

import { radius } from '../config/theme';
import { useTheme, useVerificationConfig } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon, type IconName } from '../components/Icon';
import { useText } from '../i18n/useText';
import { poaKindDays, poaKindSummary, poaPeriodLabel } from '../lib/poa-subtypes';
import type { PoaDocumentType, ProofOfAddressConfig } from '../types/workflow';

// ---------------------------------------------------------------------------
// The document kind: one row per kind with its documents in a short phrase
// and how recent it must be. The applicant picks the KIND; which document
// within it they uploaded (a water bill, a lease) the server's reader
// recognises (user decision 2026-11-07). One kind is picked because one
// document is uploaded: a radio group, a radio on the left and a primary bar
// along the chosen row's edge. Locked once a file is attached, so the kind
// cannot drift from the document already uploaded. No heading: the kinds'
// names say what the choice is.
//
// The org's own name for the 'other' kind stands alone, without the generic
// documents under it: "Council tax letter" is not an insurance policy.
// Mirrors the web SDK's steps/PoaAcceptedDocuments.tsx.
// ---------------------------------------------------------------------------

/** One glyph per kind, the SAME names the web and Flutter maps carry. */
export const POA_TYPE_ICONS: Record<PoaDocumentType, IconName> = {
  utility_bill: 'zap',
  bank_statement: 'landmark',
  tenancy_agreement: 'house',
  government_document: 'stamp',
  other: 'file-text',
};

export function PoaAcceptedDocuments({
  kinds,
  value,
  onChange,
  disabled,
  poa,
  labelFor,
  otherLabel,
}: {
  kinds: PoaDocumentType[];
  value: PoaDocumentType;
  onChange: (kind: PoaDocumentType) => void;
  disabled?: boolean;
  poa: ProofOfAddressConfig | undefined;
  labelFor: (kind: PoaDocumentType) => string;
  otherLabel: string | null;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const language = useVerificationConfig().language;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('proofOfAddress.documentType')}
      style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}
    >
      {kinds.map((kind, i) => {
        const checked = kind === value;
        const summary =
          kind === 'other' && otherLabel ? null : poaKindSummary(kind, poa?.documentSubtypes, t, language);
        const period = poaPeriodLabel(poaKindDays(poa, kind), t);
        return (
          <Pressable
            key={kind}
            onPress={() => onChange(kind)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled: Boolean(disabled) }}
            accessibilityLabel={[labelFor(kind), summary, period].filter(Boolean).join(', ')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 48,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
              backgroundColor: checked ? `${colors.primary}0D` : pressed ? colors.backgroundSecondary : 'transparent',
              opacity: disabled && !checked ? 0.5 : 1,
            })}
          >
            {/* The chosen row's edge marks it, as well as its radio. */}
            {checked ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 3,
                  borderTopRightRadius: 3,
                  borderBottomRightRadius: 3,
                  backgroundColor: colors.primary,
                }}
              />
            ) : null}
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: checked ? colors.primary : colors.gray400,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {checked ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <UiText variant="label" style={{ fontSize: 13, lineHeight: 18, fontWeight: checked ? '600' : '500' }}>
                {labelFor(kind)}
              </UiText>
              {summary ? (
                <UiText
                  variant="bodySmall"
                  color={colors.textSecondary}
                  numberOfLines={2}
                  style={{ fontSize: 11, lineHeight: 15, marginTop: 2 }}
                >
                  {summary}
                </UiText>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: colors.backgroundSecondary,
              }}
            >
              <Icon name="calendar" size={10} color={colors.textSecondary} />
              <UiText
                variant="bodySmall"
                color={colors.textSecondary}
                style={{ fontSize: 10, lineHeight: 14, fontWeight: '500', fontVariant: ['tabular-nums'] }}
              >
                {period}
              </UiText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
