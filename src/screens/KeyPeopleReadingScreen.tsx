import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Icon } from '../components/Icon';
import { UiText } from '../components/Typography';
import { useTheme } from '../components/runtime';
import { spacing } from '../config/theme';
import { PeopleLiftedOffThePage } from './KeyPeopleReadingArt';
import { READING_SCREEN_COPY as COPY, documentPeopleFoundTitle } from '../config/documentPeople';

// The key-people step while the company's documents are read for the people
// they name (config/documentPeople.ts). It fills the step, so the person
// waiting sees what is happening and why: a page being read, each person it
// names lifted off the page into a list beside it, and a line saying what is
// being looked for. It gives way on its own if the read runs long
// (useReadingScreen), so nobody is held here. Mirrors the web SDK's
// KeyPeopleReadingScreen.

const STAGE_MS = 3500;
const SLOW_MS = 20_000;
export function KeyPeopleReadingScreen({
  found,
}: {
  /** People found, once the read has finished; null while reading. */
  found: number | null;
}): React.ReactElement {
  const { colors } = useTheme();
  const [stage, setStage] = useState(0);
  const [slow, setSlow] = useState(false);
  const done = found != null;

  useEffect(() => {
    if (done) return;
    const tick = setInterval(() => setStage((s) => (s + 1) % COPY.stages.length), STAGE_MS);
    const later = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(later);
    };
  }, [done]);

  const status = done ? documentPeopleFoundTitle(found) : COPY.stages[stage]!;

  return (
    <View
      accessibilityState={{ busy: !done }}
      style={{ minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: spacing.md }}
    >
      <PeopleLiftedOffThePage found={found} />

      <View style={{ maxWidth: 360, gap: 8, alignItems: 'center' }}>
        <UiText variant="heading2" color={colors.textDark} style={{ textAlign: 'center' }} accessibilityRole="header">
          {COPY.title}
        </UiText>
        <UiText variant="bodyMedium" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {COPY.description}
        </UiText>
      </View>

      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={status}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 40,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.backgroundSecondary,
        }}
      >
        <Icon name={done ? 'check' : 'scan-line'} size={16} color={colors.primary} />
        <UiText variant="bodySmall" color={colors.textDark} style={{ fontWeight: '600' }}>
          {status}
        </UiText>
      </View>

      {!done && slow ? (
        <UiText variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center', maxWidth: 360 }}>
          {COPY.slow}
        </UiText>
      ) : null}
    </View>
  );
}
