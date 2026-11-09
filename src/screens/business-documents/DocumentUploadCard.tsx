import React from 'react';
import { Image, Pressable, View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { documentUploadHint } from '../../services/documentPicker';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { DashedBorder } from '../../components/DashedBorder';
import { Icon, type IconName } from '../../components/Icon';
import { Spinner } from '../../components/Spinner';
import { displayFileName } from '../../lib/display-file-name';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';

// ---------------------------------------------------------------------------
// The one upload a group needs: one tall pressable area (dashed, centred icon,
// "Tap to choose a file" over the size hint) that opens the source sheet
// (library, camera, files), then the file it holds with Replace and Remove.
// The applicant never names the document; the server reads it after
// submission. Mirrors the web SDK's business-documents/DocumentDropZone (a
// phone has nothing to drag, so the area only takes a tap).
// ---------------------------------------------------------------------------

const sizeLabel = (bytes: number | undefined): string | null =>
  bytes == null
    ? null
    : bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Thumb({ previewUri, isPdf }: { previewUri: string | null; isPdf: boolean }): React.ReactElement {
  const { colors } = useTheme();
  if (previewUri && !isPdf) {
    return (
      <Image
        source={{ uri: previewUri }}
        resizeMode="cover"
        style={{ width: 48, height: 48, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border }}
      />
    );
  }
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.xs,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="file-text" size={20} color={colors.textMuted} />
    </View>
  );
}

function RoundAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.background : 'transparent',
      })}
    >
      <Icon name={icon} size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function DocumentUploadCard({
  title,
  fileName,
  size,
  previewUri,
  isPdf,
  uploading,
  onChoose,
  onReplace,
  onRemove,
}: {
  /** The group, for labels read out with the controls. */
  title: string;
  fileName: string | null;
  size?: number;
  previewUri: string | null;
  isPdf: boolean;
  uploading: boolean;
  /** Open the source sheet (library, camera, files). */
  onChoose: () => void;
  onReplace: () => void;
  onRemove: () => void;
}): React.ReactElement {
  const { colors } = useTheme();

  if (fileName !== null && !uploading) {
    const kb = sizeLabel(size);
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.sm + 4,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: `${colors.success}4D`,
          backgroundColor: `${colors.success}0F`,
        }}
      >
        <Thumb previewUri={previewUri} isPdf={isPdf} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <UiText variant="label" numberOfLines={1} style={{ fontWeight: '600' }}>
            {displayFileName(fileName) ?? title}
          </UiText>
          {/* Wraps instead of running under the actions on a narrow phone or
              at a large text size, so the size has no separator to orphan. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
              <Icon name="circle-check" size={14} color={colors.success} />
              <UiText variant="bodySmall" color={colors.success} style={{ flexShrink: 1 }}>
                {COPY.uploaded}
              </UiText>
            </View>
            {kb ? (
              <UiText variant="bodySmall" color={colors.textMuted}>
                {kb}
              </UiText>
            ) : null}
          </View>
        </View>
        {/* The 44pt targets already sit apart, so the actions need no gap of
            their own, and the file name keeps that room. */}
        <View style={{ flexDirection: 'row' }}>
          <RoundAction icon="refresh-ccw" label={`${COPY.replace}: ${title}`} onPress={onReplace} />
          <RoundAction icon="close" label={`${COPY.remove}: ${title}`} onPress={onRemove} />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onChoose}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`${uploading ? COPY.uploading : COPY.tapToChoose}: ${title}`}
      accessibilityHint={documentUploadHint()}
      accessibilityState={{ disabled: uploading, busy: uploading }}
      style={({ pressed }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 176,
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.xl,
        borderRadius: radius.sm,
        backgroundColor: pressed ? colors.primary100 : colors.primary50,
      })}
    >
      <DashedBorder color={colors.primary200} radius={radius.sm} strokeWidth={1} />
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary100,
        }}
      >
        {uploading ? <Spinner size="small" color={colors.primary} /> : <Icon name="upload" size={20} color={colors.primary} />}
      </View>
      <UiText
        variant="label"
        accessibilityLiveRegion="polite"
        style={{ marginTop: spacing.sm + 4, fontWeight: '600', textAlign: 'center' }}
      >
        {uploading ? COPY.uploading : COPY.tapToChoose}
      </UiText>
      <UiText variant="bodySmall" color={colors.textMuted} style={{ marginTop: spacing.xs, textAlign: 'center' }}>
        {documentUploadHint()}
      </UiText>
    </Pressable>
  );
}
