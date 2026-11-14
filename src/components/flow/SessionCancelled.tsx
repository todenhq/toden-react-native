import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme } from '../runtime';
import { UiText } from '../Typography';
import { UiButton } from '../UiButton';
import { Icon } from '../Icon';
import { VerificationSheet } from '../VerificationSheet';
import { CANCELLED_TITLE, DEFAULT_CANCELLED_MESSAGE } from '../../lib/session-cancelled';
import { safeReportError } from '../../services/errors';
import { VerificationError } from '../../types/verification';

/**
 * Fire `onError` with `session_cancelled` ONCE, the first time the run is
 * marked cancelled, whichever call learned it (session start, a progress save,
 * the submission or the status poll).
 */
export function useReportCancellation(
  cancelled: { message: string } | null,
  onError: ((error: VerificationError) => void) | undefined,
): void {
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!cancelled || reportedRef.current) return;
    reportedRef.current = true;
    safeReportError(onError, new VerificationError('session_cancelled', cancelled.message));
  }, [cancelled, onError]);
}

/**
 * The organisation (or Myaza support) cancelled this verification session.
 *
 * Terminal by design, like the submitted error screens: the server refuses to
 * reopen or restart a cancelled session until an admin uncancels it, so no
 * Try again is offered. The only action is Close. The org's brand bar stays,
 * since this is the org's verification and the person should know whose.
 * The consumer is told through `onError` (`session_cancelled`) by the flow.
 */
export function SessionCancelled({
  message,
  onClose,
}: {
  message?: string | null;
  onClose: () => void;
}): React.ReactElement {
  return <SessionEnded title={CANCELLED_TITLE} body={message || DEFAULT_CANCELLED_MESSAGE} onClose={onClose} />;
}

/**
 * The terminal screen a session the server will no longer accept ends on
 * (cancelled, declined): the error badge, a title, the reason and Close.
 */
export function SessionEnded({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <VerificationSheet title="" onClose={onClose}>
      {/* Flutter's blocking screen, exactly: one group centred in the sheet
          (an 80px circle at the error colour's 10%, a 40px icon, 24px between
          blocks, 4px within the text) with Close right under the words, not
          pushed to the bottom. */}
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing.xl }}>
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${colors.error}1A`,
            }}
          >
            <Icon name="circle-x" size={40} color={colors.error} />
          </View>
        </View>
        <View style={{ height: spacing.lg }} />
        <UiText variant="heading2" style={{ textAlign: 'center' }} accessibilityRole="header">
          {title}
        </UiText>
        <View style={{ height: spacing.xs }} />
        <UiText variant="bodyMedium" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {body}
        </UiText>
        <View style={{ height: spacing.lg }} />
        <UiButton label="Close" onPress={onClose} />
      </View>
    </VerificationSheet>
  );
}
