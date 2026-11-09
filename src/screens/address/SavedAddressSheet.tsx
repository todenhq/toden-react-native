import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme, useVerificationConfig } from '../../components/runtime';
import { offerTitleKey } from '../../lib/address-book';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { Icon } from '../../components/Icon';
import { ContactCodeEntry } from '../../components/ContactCodeEntry';
import { FloatingSheet } from '../../components/glass/FloatingSheet';
import { useReduceMotion } from '../../components/StaggerIn';
import { useText } from '../../i18n/useText';
import { useAddressFlow } from './use-address-flow';
import { ADDRESS_BOOK_CODE_LENGTH, useAddressBook } from './use-address-book';
import { SavedAddressList, SheetHeading } from './AddressBookParts';

/**
 * The offer of a saved address, over the first address step. It appears only
 * when the flow's email is recognised, ahead of any presence primer (somebody
 * using a saved address never needs it), and asks for one decision: use it (a
 * code to that email, then a pick) or enter a new one.
 * The company receives the address only once the verification passes and the
 * person is confirmed as the book's owner (kyc-core address-book/reuse). A
 * MIRROR of the web SDK's steps/address/SavedAddressSheet.tsx.
 */
export function SavedAddressSheet(): React.ReactElement {
  const t = useText();
  const { colors } = useTheme();
  const firstName = useVerificationConfig().userData?.firstName;
  const flow = useAddressFlow();
  const book = useAddressBook();
  const [selected, setSelected] = useState<string | null>(null);
  const keyboard = useKeyboardHeight();
  const { lookUp } = book;
  useEffect(() => {
    void lookUp();
  }, [lookUp]);

  const visible = book.phase === 'offer' || book.phase === 'code' || book.phase === 'pick';
  // One address needs no choosing: it starts selected.
  const only = book.addresses.length === 1 ? book.addresses[0]!.entryId : null;
  const picked = book.addresses.find((a) => a.entryId === (selected ?? only));
  const errorLine = book.error ? (
    <UiText
      variant="bodySmall"
      color={colors.error}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ textAlign: 'center', marginTop: spacing.sm + 4 }}
    >
      {book.error}
    </UiText>
  ) : null;
  const enterNew = (
    <UiButton label={t('address.book.offer.new')} variant="ghost" labelColor={colors.textDark} disabled={book.busy} onPress={book.close} />
  );

  let body: React.ReactElement | null = null;
  if (book.phase === 'offer') {
    body = (
      <View>
        <SheetHeading icon="book-user" title={t(offerTitleKey(firstName))} description={t('address.book.offer.description')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.md }}>
          <Icon name="mail" size={16} color={colors.textDark} />
          <UiText variant="bodySmall" color={colors.textDark} style={{ flexShrink: 1, textAlign: 'center' }}>
            {t('address.book.offer.email', { email: book.email ?? '' })}
          </UiText>
        </View>
        {errorLine}
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <UiButton
            label={book.busy ? t('address.book.offer.sending') : t('address.book.offer.use')}
            loading={book.busy}
            onPress={() => void book.sendCode()}
          />
          {enterNew}
        </View>
      </View>
    );
  } else if (book.phase === 'code') {
    body = (
      <View>
        <SheetHeading
          icon="mail"
          title={t('address.book.code.title')}
          description={t('address.book.code.description', { email: book.email ?? '' })}
        />
        <View style={{ marginTop: spacing.lg }}>
          <ContactCodeEntry
            code={book.code}
            onChange={book.setCode}
            codeLength={ADDRESS_BOOK_CODE_LENGTH}
            style="segmented"
            disabled={book.busy}
            pasteColor={colors.textDark}
            onComplete={(value) => void book.checkCode(value)}
          />
        </View>
        {errorLine}
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <UiButton
            label={book.busy ? t('address.book.code.checking') : t('address.book.code.check')}
            loading={book.busy}
            disabled={book.code.length !== ADDRESS_BOOK_CODE_LENGTH}
            onPress={() => void book.checkCode()}
          />
          <UiButton label={t('address.book.code.resend')} variant="ghost" labelColor={colors.textDark} disabled={book.busy} onPress={() => void book.sendCode()} />
        </View>
      </View>
    );
  } else if (book.phase === 'pick') {
    body = (
      <View>
        <SheetHeading icon="map-pin" title={t('address.book.pick.title')} description={t('address.book.pick.description')} />
        <View style={{ marginTop: spacing.md }}>
          {book.addresses.length > 0 ? (
            <SavedAddressList addresses={book.addresses} selected={selected ?? only} onSelect={setSelected} />
          ) : (
            <UiText variant="bodyMedium" color={colors.textDark} style={{ textAlign: 'center' }}>
              {t('address.book.pick.none')}
            </UiText>
          )}
          {book.hidden > 0 ? (
            <UiText variant="bodySmall" color={colors.textDark} style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {t('address.book.pick.stale')}
            </UiText>
          ) : null}
        </View>
        {errorLine}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {book.addresses.length > 0 ? (
            <UiButton
              label={t('address.book.pick.use')}
              disabled={!picked}
              onPress={() => {
                if (!picked) return;
                book.choose(picked);
                book.close();
                flow.exitForward();
              }}
            />
          ) : null}
          {enterNew}
        </View>
      </View>
    );
  }

  return (
    <FloatingSheet visible={visible} onClose={book.close} bottomOffset={keyboard} closeLabel={t('address.book.offer.new')}>
      <PhaseFade phase={book.phase}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg }}>{body}</View>
      </PhaseFade>
    </FloatingSheet>
  );
}

/** A soft rise between the sheet's phases, so the change reads as one sheet. */
function PhaseFade({ phase, children }: { phase: string; children: React.ReactNode }): React.ReactElement {
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [phase, progress, reduced]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={{ opacity: progress, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
