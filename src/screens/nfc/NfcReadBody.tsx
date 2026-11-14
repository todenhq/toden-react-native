import React from 'react';
import { View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { NfcReadProgress } from './NfcReadProgress';
import { NfcScannedSummary } from './NfcScannedSummary';
import { NfcScanIllustration } from './NfcScanIllustration';
import type { NfcReadStage } from '../../emrtd';
import type { MrzScan } from '../../mrz/parse';

/**
 * The chip step's body: the document illustration, the read narration, and
 * what the MRZ scan found.
 *
 * The narration is the part that matters. iOS gets a system sheet describing
 * the read for free; Android gets nothing, so without this the same read is a
 * silent spinner — and silence is exactly what makes a user lift the document,
 * which aborts it.
 */
export function NfcReadBody({
  reading,
  stage,
  scan,
}: {
  reading: boolean;
  stage: NfcReadStage;
  scan: MrzScan;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <>
      <NfcScanIllustration />
      <View style={{ height: spacing.lg }} />

      {/* The header already says where to hold the document, so the body
          says only what is happening: waiting for the chip, then each step of
          the read (the builder preview draws the same). */}
      {reading ? (
        <>
          {stage !== 'waiting' && (
            <>
              <UiText variant="bodySmall" color={colors.textMuted} style={{ textAlign: 'center' }}>
                Chip found. Keep still until this finishes.
              </UiText>
              <View style={{ height: spacing.md }} />
            </>
          )}
          <NfcReadProgress stage={stage} />
        </>
      ) : (
        // Shown BEFORE the read, so the wrong document is obvious now rather
        // than after an opaque BAC failure.
        <View style={{ alignSelf: 'stretch' }}>
          <NfcScannedSummary scan={scan} />
        </View>
      )}
    </>
  );
}
