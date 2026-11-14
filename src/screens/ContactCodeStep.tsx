import React from 'react';
import { Pressable, View } from 'react-native';

import { spacing } from '../config/theme';
import { useTheme } from '../components/runtime';
import { UiText } from '../components/Typography';
import { UiAlert } from '../components/UiAlert';
import { ContactCodeEntry } from '../components/ContactCodeEntry';
import { ExpiryCountdown } from '../components/ExpiryCountdown';
import { CHANNEL_LABELS, type PhoneOtpChannel } from '../config/contact';
import type { OtpInputStyle } from '../types/workflow';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// The second half of a contact check: the code has been sent, now enter it.
//
// Split from ContactVerificationStep (200-line rule). Auto-submits on the last
// digit — the user has already typed the whole code by then, and making them
// press a button as well is a step for nothing.
//
// Layout mirrors the web SDK: the code field, then a single row carrying the
// live expiry on the left and Resend on the right, then the switch-channel
// escape hatch. A code that never arrives is usually a channel problem rather
// than a typo, so resending down the same channel is rarely the fix.
// ---------------------------------------------------------------------------

export function ContactCodeStep({
  codeLength,
  inputStyle,
  alphanumeric,
  code,
  busy,
  usedUp = false,
  error,
  attemptsLeft,
  expiresAt,
  otherChannel,
  onChange,
  onCheck,
  onResend,
}: {
  codeLength: number;
  inputStyle: OtpInputStyle;
  /** Letters as well as digits (config `alphanumericCode`). */
  alphanumeric?: boolean;
  code: string;
  busy: boolean;
  /**
   * The code's attempts are spent: the field is disabled (no typing, paste,
   * autofill or auto-submit) until a new code is sent from the primary button.
   */
  usedUp?: boolean;
  error: string | null;
  attemptsLeft?: number;
  /** ISO expiry from the send response; null falls back to static copy. */
  expiresAt: string | null;
  /** The channel NOT in use, when the workflow offers a second one. */
  otherChannel: PhoneOtpChannel | null;
  onChange: (code: string) => void;
  onCheck: (code: string) => void;
  /** Resends; with a channel, switches to it first. */
  onResend: (switchTo?: PhoneOtpChannel) => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  // No "enter the code we sent to …" line here: the sheet header carries it
  // (see contactMeta), matching the web SDK. Two copies drifted apart.
  return (
    <View>
      <ContactCodeEntry
        code={code}
        onChange={onChange}
        codeLength={codeLength}
        style={inputStyle}
        alphanumeric={alphanumeric}
        disabled={busy || usedUp}
        onComplete={onCheck}
      />

      <View style={{ height: spacing.sm }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {expiresAt ? (
          <ExpiryCountdown expiresAt={expiresAt} />
        ) : (
          <UiText variant="bodySmall" color={colors.textMuted}>
            The code expires in 5 minutes.
          </UiText>
        )}
        {/* A used-up code sends its replacement from the primary button, so
            the link would only repeat it. */}
        {usedUp ? null : (
          <Pressable
            onPress={() => onResend()}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
          >
            <UiText
              variant="bodySmall"
              color={busy ? colors.textMuted : colors.primary}
              style={{ fontWeight: '600' }}
            >
              {t('contact.code.resend')}
            </UiText>
          </Pressable>
        )}
      </View>

      {otherChannel ? (
        <>
          <View style={{ height: spacing.sm }} />
          <Pressable
            onPress={() => onResend(otherChannel)}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
          >
            <UiText
              variant="bodySmall"
              color={colors.textMuted}
              style={{ textAlign: 'center' }}
            >
              {`Didn't get it? Send by ${CHANNEL_LABELS[otherChannel]} instead`}
            </UiText>
          </Pressable>
        </>
      ) : null}

      {error ? (
        // A tinted error card rather than a line of small text: a wrong or
        // used-up code is the one thing the applicant must notice here. The
        // remaining count is what stops someone burning the whole budget
        // guessing; without it there is no signal the code is about to die.
        <View style={{ marginTop: spacing.md }}>
          <UiAlert
            variant="error"
            // The title, as Flutter does: the foreground colour and semibold.
            // As the message it was drawn one step quieter, in grey.
            title={
              attemptsLeft !== undefined
                ? `${error} ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`
                : error
            }
          />
        </View>
      ) : null}
    </View>
  );
}
