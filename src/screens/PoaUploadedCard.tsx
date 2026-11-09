import React from 'react';
import { Image, Pressable, View } from 'react-native';

import { radius } from '../config/theme';
import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon, type IconName } from '../components/Icon';
import { CountryFlag } from '../components/CountryFlag';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// Proof of Address after the upload: the person's own document as a page,
// tilted and ticked, with what it is, where it is from, and Replace / Remove.
// Mirrors the web SDK's steps/PoaUploadedCard.tsx. The picked file's local URI
// is kept for the thumbnail (the only way to catch "wrong photo from the
// camera roll"); after a remount it is gone and a page glyph stands in.
// ---------------------------------------------------------------------------

function UploadedPage({ preview }: { preview: { uri: string; isPdf: boolean } | null }): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 88,
        height: 114,
        borderRadius: radius.xs,
        backgroundColor: '#FFFFFF',
        transform: [{ rotate: '-2deg' }],
        shadowColor: '#000000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius.xs,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F7F8FA',
        }}
      >
        {preview && !preview.isPdf ? (
          <Image source={{ uri: preview.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <>
            <Icon name="file-text" size={28} color="#8A91A1" />
            {preview?.isPdf ? (
              <UiText variant="bodySmall" color="#646C7D" style={{ fontSize: 10, fontWeight: '600', marginTop: 4 }}>
                PDF
              </UiText>
            ) : null}
          </>
        )}
      </View>
      <View
        style={{
          position: 'absolute',
          right: -8,
          bottom: -8,
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 3,
          borderColor: colors.background,
          backgroundColor: colors.success,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} />
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  bordered,
  onPress,
}: {
  icon: IconName;
  label: string;
  bordered: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingHorizontal: 12,
        borderRadius: radius.full,
        borderWidth: bordered ? 1 : 0,
        borderColor: colors.border,
        backgroundColor: pressed ? (bordered ? colors.backgroundSecondary : colors.errorBg) : 'transparent',
      })}
    >
      {({ pressed }) => {
        const tint = bordered ? colors.textDark : pressed ? colors.error : colors.textSecondary;
        return (
          <>
            <Icon name={icon} size={14} color={tint} />
            <UiText variant="bodySmall" color={tint} style={{ fontWeight: '500' }}>
              {label}
            </UiText>
          </>
        );
      }}
    </Pressable>
  );
}

/** The card after a file: the document, what it is, and a way to change it. */
export function PoaUploadedCard({
  preview,
  fileName,
  typeLabel,
  country,
  onReplace,
  onRemove,
}: {
  preview: { uri: string; isPdf: boolean } | null;
  fileName: string | null;
  typeLabel: string;
  country: string | null;
  onReplace: () => void;
  onRemove: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        paddingHorizontal: 16,
        paddingVertical: 20,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <UploadedPage preview={preview} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <UiText variant="bodySmall" color={colors.success} style={{ fontWeight: '600' }}>
          {t('proofOfAddress.uploaded')}
        </UiText>
        <UiText variant="label" numberOfLines={1} style={{ fontWeight: '600', marginTop: 4 }}>
          {fileName || typeLabel}
        </UiText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {country ? <CountryFlag country={country} size={16} /> : null}
          <UiText variant="bodySmall" color={colors.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {typeLabel}
          </UiText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          <Action icon="refresh-ccw" label={t('proofOfAddress.replace')} bordered onPress={onReplace} />
          <Action icon="x" label={t('proofOfAddress.remove')} bordered={false} onPress={onRemove} />
        </View>
      </View>
    </View>
  );
}
