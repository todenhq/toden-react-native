import React from 'react';
import { View } from 'react-native';

import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { UiText } from '../components/Typography';
import { useTheme } from '../components/runtime';
import { radius, spacing } from '../config/theme';
import {
  DOCUMENT_PEOPLE_READING_NOTE,
  documentPeopleAddedNote,
  documentPeopleKeptNote,
  documentPeopleFoundTitle,
} from '../config/documentPeople';

// What the company documents did for this list, at the top of the key-people
// step: still being read (after the applicant chose to carry on), or the
// people they named, filled in and waiting for an email each. The "found" card
// is deliberately loud, a tinted card with a title, because it is the reason
// the applicant has less to type and the thing they must act on. Announced
// politely. Mirrors the web SDK's KeyPeopleDocumentsNote.

export function KeyPeopleDocumentsNote({
  reading,
  added,
  kept = 0,
}: {
  reading: boolean;
  added: number;
  /** People kept from a removed document because the applicant had changed them. */
  kept?: number;
}): React.ReactElement {
  const { colors } = useTheme();
  if (kept > 0 && !reading && added === 0) {
    const note = documentPeopleKeptNote(kept);
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={note}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: spacing.lg,
          padding: 16,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.warning,
          backgroundColor: colors.warningBg,
        }}
      >
        <Icon name="file-text" size={20} color={colors.textDark} />
        <UiText variant="bodySmall" color={colors.textDark} style={{ flex: 1 }}>
          {note}
        </UiText>
      </View>
    );
  }
  if (reading) {
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={DOCUMENT_PEOPLE_READING_NOTE}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginBottom: spacing.lg,
          padding: 16,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.backgroundSecondary,
        }}
      >
        <Spinner size="small" color={colors.primary} />
        <UiText variant="bodySmall" color={colors.textDark} style={{ flex: 1 }}>
          {DOCUMENT_PEOPLE_READING_NOTE}
        </UiText>
      </View>
    );
  }
  const title = documentPeopleFoundTitle(added);
  const body = documentPeopleAddedNote(added);
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${body}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        marginBottom: spacing.lg,
        padding: 16,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: colors.primary,
        backgroundColor: colors.backgroundSecondary,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
        }}
      >
        <Icon name="file-text" size={20} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <UiText variant="heading3" color={colors.textDark}>
            {title}
          </UiText>
          <Icon name="sparkles" size={16} color={colors.primary} />
        </View>
        <UiText variant="bodySmall" color={colors.textDark}>
          {body}
        </UiText>
      </View>
    </View>
  );
}
