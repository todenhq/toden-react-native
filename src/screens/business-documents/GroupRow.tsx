import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { Icon } from '../../components/Icon';
import type { BusinessDocumentGroup } from '../../config/businessDocumentGroups';
import { displayFileName } from '../../lib/display-file-name';
import { GroupNumber } from './GroupCardParts';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';

// ---------------------------------------------------------------------------
// A neighbouring group's card, tucked behind the open one like the next card
// on a vertical carousel: inset and muted, with only one edge showing. The
// next group sits above (its top showing, not a control: a group still ahead
// cannot be opened yet) and the previous group below (its bottom showing,
// pressable, so the applicant can go back and change it). The open card
// overlaps the hidden edge by TUCK, so each card keeps extra padding on that
// side. Mirrors the web SDK's business-documents/GroupRow.
// ---------------------------------------------------------------------------

/** How far the open card overlaps a tucked card. */
export const TUCK = 12;

/** A business document group as a tucked card (see TuckedRow). */
export function GroupRow({
  group,
  number,
  fileName,
  onOpen,
}: {
  group: BusinessDocumentGroup;
  number: number;
  /** The file the group holds; null when it has none. */
  fileName: string | null;
  /** Present for the previous group only. */
  onOpen?: () => void;
}): React.ReactElement {
  const done = fileName !== null;
  // A file name that is a random id, or none at all (a restored upload), reads
  // as Uploaded: the group holds a document, so it is never Skipped.
  const detail =
    onOpen !== undefined
      ? done
        ? (displayFileName(fileName) ?? COPY.uploaded)
        : COPY.skipped
      : group.types.map((x) => x.label).join(', ');
  return <TuckedRow title={group.title} number={number} done={done} detail={detail} onOpen={onOpen} />;
}

/** The tucked card itself, shared by the business documents' groups and the
 *  supporting documents. */
export function TuckedRow({
  title,
  number,
  done,
  detail,
  onOpen,
}: {
  title: string;
  number: number;
  /** It holds something: shows the tick on its number. */
  done: boolean;
  /** The line under the title: what it asks for, or what it holds. */
  detail: string;
  /** Present for the previous card only. */
  onOpen?: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const previous = onOpen !== undefined;

  const card: ViewStyle = {
    marginHorizontal: TUCK,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.sm + 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  };

  const body = (
    <>
      <GroupNumber number={number} done={done} tucked />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <UiText variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '500', flexShrink: 1 }}>
            {title}
          </UiText>
          {previous ? null : (
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: colors.background,
              }}
            >
              <UiText variant="bodySmall" color={colors.textMuted} style={{ fontSize: 11, fontWeight: '500' }}>
                {COPY.next}
              </UiText>
            </View>
          )}
        </View>
        <UiText variant="bodySmall" color={colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
          {detail}
        </UiText>
      </View>
    </>
  );

  if (onOpen) {
    return (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${detail}. ${COPY.change}`}
        style={({ pressed }) => ({
          ...card,
          marginTop: -TUCK,
          paddingTop: 20,
          paddingBottom: 10,
          borderTopWidth: 0,
          borderBottomLeftRadius: radius.sm,
          borderBottomRightRadius: radius.sm,
          backgroundColor: pressed ? colors.border : colors.backgroundSecondary,
        })}
      >
        {body}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <UiText variant="bodySmall" color={colors.primary} style={{ fontWeight: '500' }}>
            {COPY.change}
          </UiText>
          <Icon name="chevron-right" size={14} color={colors.primary} />
        </View>
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${COPY.next}: ${title}. ${detail}`}
      style={{
        ...card,
        marginBottom: -TUCK,
        paddingTop: 10,
        paddingBottom: 20,
        borderBottomWidth: 0,
        borderTopLeftRadius: radius.sm,
        borderTopRightRadius: radius.sm,
      }}
    >
      {body}
    </View>
  );
}

/** A thin edge of a card further back, so the carousel shows there is more. */
export function GroupEdge({ side }: { side: 'top' | 'bottom' }): React.ReactElement {
  const { colors } = useTheme();
  const top = side === 'top';
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        marginHorizontal: TUCK * 2,
        height: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.backgroundSecondary,
        opacity: 0.6,
        ...(top
          ? { marginBottom: -4, borderBottomWidth: 0, borderTopLeftRadius: radius.xs, borderTopRightRadius: radius.xs }
          : { marginTop: -4, borderTopWidth: 0, borderBottomLeftRadius: radius.xs, borderBottomRightRadius: radius.xs }),
      }}
    />
  );
}
