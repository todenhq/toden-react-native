import React from 'react';
import { Image, View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { UiPulseLoader } from '../../components/UiPulseLoader';
import { StyleAbsFill } from './constants';
import { Spinner } from '../../components/Spinner';
import { SELFIE_ASPECT } from '../../lib/selfie-pick';

// ---------------------------------------------------------------------------
// The captured selfie, shown back while it uploads.
// ---------------------------------------------------------------------------

export function SelfiePreview({
  uri,
  uploading,
  soft = false,
}: {
  uri: string | null;
  uploading?: boolean;
  /** The still reads out of focus (lib/selfie-sharpness). */
  soft?: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  // Passport-shaped, as the selfie is cut (lib/selfie-pick.ts): 3:4, head
  // and shoulders, in a rounded rectangle rather than a circle.
  const W = 176;
  const H = Math.round(W / SELFIE_ASPECT);
  const R = 16;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
      <View style={{ width: W, height: H, borderRadius: R, borderWidth: 4, backgroundColor: uri ? '#111111' : `${colors.primary}14`, borderColor: `${colors.primary}33`, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {/* borderRadius repeated on the Image — iOS doesn't reliably clip an Image
            child to a rounded parent (same fix as the header brand bar). A null
            uri is a restored session whose local file is gone: the uploaded
            selfie is the durable record, so show a completed state rather than
            a broken image. */}
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: R - 4 }} resizeMode="cover" />
        ) : (
          <UiText variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center', paddingHorizontal: spacing.lg }}>
            Selfie already captured
          </UiText>
        )}
        {/* Standard upload loader inside the preview (mirrors web/Flutter). */}
        {uploading ? (
          <View style={[StyleAbsFill, { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }]}>
            <UiPulseLoader size={64} />
          </View>
        ) : null}
      </View>
      <View style={{ height: spacing.md }} />
      {/* The heading is the review's verdict on the photo, so a soft still must
          not read "Looking good!". Continue stays available either way: the
          floor is uncalibrated, and a wrong one should cost a sentence, never
          a retake loop. */}
      <UiText variant="heading3" color={soft ? colors.warning : undefined} style={{ textAlign: 'center' }}>
        {soft ? 'This photo looks blurry' : 'Looking good!'}
      </UiText>
      <UiText variant="bodySmall" color={colors.textSecondary} style={{ textAlign: 'center' }}>
        {soft
          ? 'For the best chance of a match, retake it holding the phone steady until your face is sharp.'
          : 'Tap Continue to submit, or Retake to try again.'}
      </UiText>
    </View>
  );
}
