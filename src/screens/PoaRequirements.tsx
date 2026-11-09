import React, { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon } from '../components/Icon';
import { useText } from '../i18n/useText';
import type { PoaDocumentType, ProofOfAddressConfig } from '../types/workflow';
import { PoaAcceptedSheet } from './PoaAcceptedSheet';

// ---------------------------------------------------------------------------
// "See accepted documents": opens the full list, every kind on offer with the
// documents inside it (PoaAcceptedSheet). What the document must show (name,
// address, how recent) is the step's own description, so it is not repeated
// here as chips (removed on web 2026-11-07). Mirrors the web SDK's
// steps/PoaRequirements.tsx.
// ---------------------------------------------------------------------------

export function PoaRequirements({
  kinds,
  selected,
  poa,
  labelFor,
  otherLabel,
}: {
  kinds: PoaDocumentType[];
  selected: PoaDocumentType;
  poa: ProofOfAddressConfig | undefined;
  labelFor: (kind: PoaDocumentType) => string;
  otherLabel: string | null;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('proofOfAddress.accepted.open')}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 6,
          paddingVertical: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="info" size={14} color={colors.primary} />
        <UiText variant="bodySmall" color={colors.primary} style={{ fontWeight: '600' }}>
          {t('proofOfAddress.accepted.open')}
        </UiText>
      </Pressable>
      <PoaAcceptedSheet
        open={open}
        kinds={kinds}
        selected={selected}
        poa={poa}
        labelFor={labelFor}
        otherLabel={otherLabel}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
