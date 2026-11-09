import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon } from '../components/Icon';
import { FloatingSheet } from '../components/glass/FloatingSheet';
import { useText } from '../i18n/useText';
import { acceptedSubtypes, poaKindDays, poaPeriodLabel, poaSubtypeKey } from '../lib/poa-subtypes';
import type { PoaDocumentType, ProofOfAddressConfig } from '../types/workflow';
import { POA_TYPE_ICONS } from './PoaAcceptedDocuments';

// ---------------------------------------------------------------------------
// Every document the workflow accepts, kind by kind, with how recent each kind
// must be. The SDK's own bottom sheet (FloatingSheet, as the key-person and
// country sheets use it): dragged down, the close button or the backdrop
// dismisses it. The kind picked on the step is highlighted. Mirrors the web
// SDK's steps/PoaAcceptedSheet.tsx.
// ---------------------------------------------------------------------------

export function PoaAcceptedSheet({
  open,
  kinds,
  selected,
  poa,
  labelFor,
  otherLabel,
  onClose,
}: {
  open: boolean;
  kinds: PoaDocumentType[];
  /** The kind picked on the step, marked in the list. */
  selected: PoaDocumentType;
  poa: ProofOfAddressConfig | undefined;
  labelFor: (kind: PoaDocumentType) => string;
  otherLabel: string | null;
  onClose: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const { height } = useWindowDimensions();

  return (
    <FloatingSheet
      visible={open}
      onClose={onClose}
      maxHeight={height * 0.85}
      closeLabel={t('proofOfAddress.accepted.close')}
      title={t('proofOfAddress.accepted.title')}
      description={t('proofOfAddress.accepted.description')}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm + 4 }}
      >
        {kinds.map((kind) => {
          const chosen = kind === selected;
          const documents =
            kind === 'other' && otherLabel
              ? [otherLabel]
              : acceptedSubtypes(kind, poa?.documentSubtypes).map((s) => t(poaSubtypeKey(s)));
          return (
            <View
              key={kind}
              accessibilityLabel={`${labelFor(kind)}: ${documents.join(', ')}`}
              style={{
                padding: 14,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: chosen ? `${colors.primary}66` : colors.border,
                backgroundColor: chosen ? `${colors.primary}0A` : colors.background,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.xs,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: chosen ? colors.primary : colors.backgroundSecondary,
                  }}
                >
                  <Icon name={POA_TYPE_ICONS[kind]} size={16} color={chosen ? colors.onPrimary : colors.textSecondary} />
                </View>
                <UiText variant="label" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
                  {labelFor(kind)}
                </UiText>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radius.full,
                    backgroundColor: colors.backgroundSecondary,
                  }}
                >
                  <Icon name="calendar" size={12} color={colors.textSecondary} />
                  <UiText variant="bodySmall" color={colors.textSecondary} style={{ fontSize: 11, fontWeight: '500' }}>
                    {poaPeriodLabel(poaKindDays(poa, kind), t)}
                  </UiText>
                </View>
              </View>
              <View style={{ marginTop: 10, gap: 6 }}>
                {documents.map((document) => (
                  <View key={document} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ marginTop: 1 }}>
                      <Icon name="check" size={14} color={colors.primary} />
                    </View>
                    <UiText variant="bodySmall" style={{ flex: 1, lineHeight: 16 }}>
                      {document}
                    </UiText>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </FloatingSheet>
  );
}
