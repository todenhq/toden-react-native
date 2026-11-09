import React from 'react';
import { Pressable, View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { Icon, type IconName } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// Proof of Address: how the document comes in, as the workflow's
// `proofOfAddress.capture` says: take a photo, upload a file, or both side by
// side (the default). While the upload runs the tiles give way to one
// progress row. Split from the step (200-line rule); the step owns the
// picking, uploading and removing. Mirrors the web SDK's
// steps/PoaUploadActions.tsx (a phone has no file to drop, so no drop hint).
// ---------------------------------------------------------------------------

export type PoaCapture = 'both' | 'camera' | 'file';

function Tile({
  icon,
  title,
  hint,
  primary,
  row,
  onPress,
}: {
  icon: IconName;
  title: string;
  hint: string;
  primary: boolean;
  /** Laid out as a row: the file tile alone, the full width. */
  row: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const fg = primary ? colors.onPrimary : colors.textDark;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hint}`}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: row ? 'row' : 'column',
        alignItems: row ? 'center' : 'flex-start',
        justifyContent: row ? 'flex-start' : 'space-between',
        gap: 12,
        minHeight: row ? 0 : 88,
        padding: 14,
        borderRadius: radius.md,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.primary : pressed ? colors.backgroundSecondary : colors.background,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? 'rgba(255,255,255,0.15)' : `${colors.primary}1A`,
        }}
      >
        <Icon name={icon} size={18} color={primary ? colors.onPrimary : colors.primary} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <UiText variant="label" color={fg} style={{ fontWeight: '600' }}>
          {title}
        </UiText>
        <UiText
          variant="bodySmall"
          color={primary ? colors.onPrimary : colors.textSecondary}
          style={primary ? { opacity: 0.8 } : undefined}
        >
          {hint}
        </UiText>
      </View>
    </Pressable>
  );
}

export function PoaUploadActions({
  capture = 'both',
  uploading,
  fileHint,
  onCamera,
  onFile,
}: {
  capture?: PoaCapture;
  uploading: boolean;
  /** Under "Upload a file": what can be chosen in this build. */
  fileHint: string;
  onCamera: () => void;
  onFile: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();

  if (uploading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('proofOfAddress.uploading')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${colors.primary}1A`,
          }}
        >
          <Spinner size={16} color={colors.primary} />
        </View>
        <UiText variant="label">{t('proofOfAddress.uploading')}</UiText>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm + 2 }}>
      {capture !== 'file' ? (
        <Tile
          icon="camera"
          title={t('proofOfAddress.action.camera')}
          hint={t('proofOfAddress.action.cameraHint')}
          primary
          row={false}
          onPress={onCamera}
        />
      ) : null}
      {capture !== 'camera' ? (
        <Tile
          icon="upload"
          title={t('proofOfAddress.action.file')}
          hint={fileHint}
          primary={false}
          row={capture === 'file'}
          onPress={onFile}
        />
      ) : null}
    </View>
  );
}
