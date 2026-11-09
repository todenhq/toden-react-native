import React, { useRef, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';

import { radius, spacing } from '../../config/theme';
import { useFlowState, useTheme, useVerificationStore } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { Icon } from '../../components/Icon';
import { FloatingSheet } from '../../components/glass/FloatingSheet';
import { NO_SAVE } from '../../lib/address-book';
import { useText } from '../../i18n/useText';
import { SheetHeading } from './AddressBookParts';

/**
 * Asked once the person confirms their address: keep it in their Toden address
 * book? Saving is their choice, so nothing happens until they answer. The
 * entrance photo is part of a saved address and the sheet says so; the
 * directions stay a choice of their own. Closing it (X, swipe, backdrop) keeps
 * them on the review; "Not now" carries on without saving. A MIRROR of the web
 * SDK's steps/address/SaveAddressSheet.tsx.
 */
export function SaveAddressSheet({
  open,
  line,
  onClose,
  onDecided,
}: {
  open: boolean;
  line: string;
  onClose: () => void;
  /** The answer is stored; the confirmation carries on. */
  onDecided: () => void;
}): React.ReactElement {
  const t = useText();
  const { colors } = useTheme();
  const store = useVerificationStore();
  const directions = useFlowState((s) => Boolean(s.address?.directions?.trim()));
  const hasPhoto = useFlowState((s) => Boolean(s.mediaIds.addressPhoto));
  const previewUri = useFlowState((s) => s.addressPhotoPreview);
  const [withDirections, setWithDirections] = useState(false);

  // iOS will not present what comes next (a location prompt) while this modal
  // is still leaving, so the answer runs from onDismiss, as MediaSourceSheet's.
  const pending = useRef(false);
  const decide = (save: boolean): void => {
    store.getState().setAddressBookSave(save ? { save: true, photo: true, directions: withDirections } : NO_SAVE);
    if (Platform.OS === 'ios') {
      pending.current = true;
      onClose();
      return;
    }
    onClose();
    onDecided();
  };

  return (
    <FloatingSheet
      visible={open}
      onClose={onClose}
      onDismiss={() => {
        if (!pending.current) return;
        pending.current = false;
        onDecided();
      }}
    >
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg }}>
        <SheetHeading icon="book-user" title={t('address.book.save.title')} description={t('address.book.save.description')} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginTop: spacing.md,
            padding: 12,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              accessibilityLabel={t('address.book.save.photo')}
              style={{ width: 44, height: 44, borderRadius: radius.sm }}
            />
          ) : (
            <Icon name="map-pin" size={20} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <UiText variant="label" color={colors.textDark} numberOfLines={2}>
              {line}
            </UiText>
            {hasPhoto ? (
              <UiText variant="bodySmall" color={colors.textDark} style={{ marginTop: 2 }}>
                {t('address.book.save.photo')}
              </UiText>
            ) : null}
          </View>
        </View>
        {directions ? (
          <Pressable
            onPress={() => setWithDirections((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: withDirections }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginTop: spacing.sm }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: withDirections ? colors.primary : colors.border,
                backgroundColor: withDirections ? colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {withDirections ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
            </View>
            <UiText variant="bodyMedium" color={colors.textDark}>{t('address.book.save.directions')}</UiText>
          </Pressable>
        ) : null}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <UiButton label={t('address.book.save.confirm')} onPress={() => decide(true)} />
          <UiButton label={t('address.book.save.skip')} variant="ghost" labelColor={colors.textDark} onPress={() => decide(false)} />
        </View>
      </View>
    </FloatingSheet>
  );
}
