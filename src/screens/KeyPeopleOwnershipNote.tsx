import React from 'react';
import { View } from 'react-native';

import { Icon } from '../components/Icon';
import { UiText } from '../components/Typography';
import { useTheme } from '../components/runtime';
import { radius, spacing } from '../config/theme';
import {
  OWNERSHIP_PENDING_STEP_NOTE,
  OWNERSHIP_PENDING_SUBMITTED_NOTE,
} from '../config/ownershipPending';

// Shareholders the register has not sent yet (config/ownershipPending.ts).
// One quiet line, icon and words, announced politely: on the key-people step
// it says owners can still be added by hand, and on the success screen it says
// their invite links are coming. Mirrors the web SDK's KeyPeopleOwnershipNote.

export function KeyPeopleOwnershipNote({
  where,
}: {
  where: 'step' | 'submitted';
}): React.ReactElement {
  const { colors } = useTheme();
  const text = where === 'step' ? OWNERSHIP_PENDING_STEP_NOTE : OWNERSHIP_PENDING_SUBMITTED_NOTE;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        alignSelf: 'stretch',
        marginTop: spacing.sm + 4,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.backgroundSecondary,
      }}
    >
      <View style={{ marginTop: 2 }}>
        <Icon name="info" size={16} color={colors.primary} />
      </View>
      <UiText variant="bodySmall" color={colors.textSecondary} style={{ flex: 1 }}>
        {text}
      </UiText>
    </View>
  );
}
