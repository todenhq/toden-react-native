import React from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { UiButton } from '../components/UiButton';
import { ContactFooterNote } from './ContactFooterNote';
import { useText } from '../i18n/useText';
import { SEND_NEW_CODE_LABEL } from '../lib/contact-code-state';

// ---------------------------------------------------------------------------
// The contact step's footer: the one primary action (send, then verify), the
// optional skip, and the reassurance note. Split from ContactVerificationStep
// (200-line rule); the step owns every decision and this only renders them.
// ---------------------------------------------------------------------------

export function ContactActions({
  hasChallenge,
  codeUsedUp = false,
  busy,
  disabled,
  required,
  isEmail,
  onPrimary,
  onSkip,
}: {
  /** A code is out: the button verifies instead of sending. */
  hasChallenge: boolean;
  /** The code's attempts are spent: the button sends a new code. */
  codeUsedUp?: boolean;
  busy: boolean;
  disabled: boolean;
  /** `required: false` adds the skip; the server enforces the rest. */
  required: boolean;
  isEmail: boolean;
  onPrimary: () => void;
  onSkip: () => void;
}): React.ReactElement {
  const t = useText();
  return (
    <>
      <View style={{ height: spacing.md }} />
      <UiButton
        label={
          hasChallenge
            ? codeUsedUp
              ? SEND_NEW_CODE_LABEL
              : t('contact.verifyCode')
            : t('contact.sendCode')
        }
        loading={busy}
        disabled={disabled}
        onPress={onPrimary}
      />

      {!required ? (
        <>
          <View style={{ height: spacing.sm }} />
          <UiButton label={t('contact.skip')} variant="ghost" disabled={busy} onPress={onSkip} />
        </>
      ) : null}

      <View style={{ height: spacing.md }} />
      <ContactFooterNote isEmail={isEmail} />
    </>
  );
}
