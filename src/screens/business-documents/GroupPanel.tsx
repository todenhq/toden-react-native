import React from 'react';
import { View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { groupUpload, type BusinessDocumentGroup } from '../../config/businessDocumentGroups';
import { DocumentUploadCard } from './DocumentUploadCard';
import { AcceptedDocuments, GroupNumber } from './GroupCardParts';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';
import { groupSlot, type GroupSlot, type GroupUpload } from './useGroupUpload';

// ---------------------------------------------------------------------------
// The open group's card, in front of the carousel: its number, title, whether
// it is required and where it sits ("2 of 4"), the documents it accepts (any
// one of them, each with how recent it must be) as a short list, then a tall
// upload area. There is nothing to choose: the server recognises the document
// from its own text. Mirrors the web SDK's business-documents/GroupPanel.
// ---------------------------------------------------------------------------

export function GroupPanel({
  group,
  number,
  total,
  docs,
  onPick,
}: {
  group: BusinessDocumentGroup;
  number: number;
  total: number;
  docs: GroupUpload;
  /** Open the source sheet (the upload area, or Replace). */
  onPick: (slot: GroupSlot) => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const uploaded = groupUpload(group, docs.uploads);
  const slot = groupSlot(group);

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.primary200,
        backgroundColor: colors.background,
        shadowColor: '#070330',
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 }}>
        <GroupNumber number={number} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
          <UiText variant="heading3" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {group.title}
          </UiText>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radius.full,
              backgroundColor: group.required ? colors.primary100 : colors.backgroundSecondary,
            }}
          >
            <UiText
              variant="bodySmall"
              color={group.required ? colors.primary : colors.textSecondary}
              style={{ fontWeight: '500' }}
            >
              {group.required ? COPY.required : COPY.optional}
            </UiText>
          </View>
        </View>
        {total > 1 ? (
          <UiText variant="bodySmall" color={colors.textMuted} style={{ fontWeight: '500', fontVariant: ['tabular-nums'] }}>
            {COPY.progress(number, total)}
          </UiText>
        ) : null}
      </View>

      <AcceptedDocuments group={group} />

      <View style={{ marginTop: spacing.md }}>
        <DocumentUploadCard
          title={group.title}
          fileName={uploaded?.fileName ?? null}
          size={uploaded?.size}
          previewUri={uploaded?.previewUri ?? null}
          isPdf={uploaded?.isPdf === true}
          uploading={docs.uploading === group.key}
          onChoose={() => onPick(slot)}
          onReplace={() => onPick(slot)}
          onRemove={() => docs.remove(group)}
        />
      </View>

      {docs.error ? (
        <UiText
          variant="bodySmall"
          color={colors.error}
          accessibilityLiveRegion="polite"
          style={{ marginTop: spacing.sm }}
        >
          {docs.error}
        </UiText>
      ) : null}
    </View>
  );
}
