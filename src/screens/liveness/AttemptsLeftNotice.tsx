import React from 'react';
import { View } from 'react-native';

import { radius } from '../../config/theme';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { AMBER_800 } from './constants';

// ---------------------------------------------------------------------------
// The failed check's second line, "1 attempt left." or "2 attempts left."
// (lib/liveness-attempts.ts), as a small warning under the red message.
//
// A slim pill on the warning tint with a warning glyph, the words in the body
// colour rather than red, so it reads as a heads-up and not a second error.
// It was drawn as a second line of the red message itself. The same notice as
// Flutter's `LivenessAttemptsLeft` and the web SDK's AttemptsLeftNotice.
//
// The glyph's ink is amber-800 on the light tint (6.3:1; the warning yellow is
// 1.5:1 there) and the warning yellow on the dark one (10:1). The glyph is
// hidden from screen readers: the words carry it.
// ---------------------------------------------------------------------------

export function AttemptsLeftNotice({ text }: { text: string }): React.ReactElement {
  const { colors, mode } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        maxWidth: '100%',
        gap: 6,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: `${colors.warning}66`,
        backgroundColor: colors.warningBg,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="triangle-alert" size={14} color={mode === 'dark' ? colors.warning : AMBER_800} />
      </View>
      <UiText variant="bodySmall" color={colors.textDark} style={{ flexShrink: 1, fontWeight: '500', textAlign: 'center' }}>
        {text}
      </UiText>
    </View>
  );
}
