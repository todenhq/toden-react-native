import React from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useTheme, useVerificationConfig } from '../components/runtime';
import { isScopedBusiness } from '../lib/scope';
import { businessKey } from '../i18n/business-variants';
import { UiText } from '../components/Typography';
import { Icon } from '../components/Icon';
import { useText } from '../i18n/useText';

/**
 * The reassurance line under the contact step's actions, matching the web SDK.
 *
 * Small, but it answers the question the step provokes: an email step is asked
 * "what will you do with my address", a phone step "will this cost me money".
 */
export function ContactFooterNote({ isEmail }: { isEmail: boolean }): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  // A scoped business workflow confirms the company's contact details.
  const scopedBusiness = isScopedBusiness(useVerificationConfig());
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
      }}
    >
      <Icon name={isEmail ? 'mail' : 'smartphone'} size={12} color={colors.textMuted} />
      <UiText variant="bodySmall" color={colors.textMuted}>
        {isEmail ? t(businessKey('contact.email.footer', scopedBusiness)) : t('contact.phone.footer')}
      </UiText>
    </View>
  );
}
