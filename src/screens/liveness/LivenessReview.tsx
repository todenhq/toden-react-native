import React from 'react';
import { Image, View } from 'react-native';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { useText } from '../../i18n/useText';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { UiPulseLoader } from '../../components/UiPulseLoader';
import { Icon } from '../../components/Icon';
import { PhotoBackdrop } from './Backdrop';
import { StyleAbsFill } from './constants';
import { ImmersiveFrame } from './ImmersiveFrame';
import { Panel, Pill } from './ImmersiveSurfaces';
import { SELFIE_DONE_BODY, SELFIE_DONE_TITLE } from './LivenessOutcome';
import type { SelfieUpload } from './useSelfieUpload';
import { SELFIE_ASPECT } from '../../lib/selfie-pick';

// ---------------------------------------------------------------------------
// The review, full screen: the selfie as it was cut (3:4, head and shoulders,
// lib/selfie-pick.ts) in a rounded rectangle centred where the camera's
// window was, over the same photo blurred.
//
// Only with a photo to show. A restored session has the uploaded media id and
// no local file, and keeps the sheet's own review (LivenessComplete).
// ---------------------------------------------------------------------------

/** The selfie's green edge on the review. */
const RIM = 4;
/** The selfie's corners on the review (web's rounded-2xl, at this size). */
const REVIEW_RADIUS = 24;

export function LivenessReview({
  selfieUri,
  soft: reportedSoft = false,
  upload,
  done = false,
  onRetake,
  onContinue,
}: {
  selfieUri: string;
  /** The still reads out of focus. A notice, never a gate. */
  soft?: boolean;
  upload: SelfieUpload;
  /** Taken on an earlier visit: shown as finished, with Continue and no Retake. */
  done?: boolean;
  onRetake: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const soft = reportedSoft && !done;
  const { uploading, uploadError, retryInfo, selfieIdRef, videoPathRef, uploadSelfieAndVideo } = upload;
  const busy = uploading && !uploadError;

  const title = busy ? 'Saving your selfie…' : done ? SELFIE_DONE_TITLE : 'Selfie captured';
  const note = done
    ? SELFIE_DONE_BODY
    : soft
      ? 'This photo looks blurry. For the best chance of a match, retake it holding the phone steady until your face is sharp.'
      : null;

  return (
    <ImmersiveFrame
      // The photo twice: blurred behind, and sharp in the window.
      backdrop={() => <PhotoBackdrop uri={selfieUri} />}
      cutout={(window) => {
        // Passport-shaped, as the selfie is cut (lib/selfie-pick.ts): the
        // 3:4 still whole, in a rounded rectangle centred in the window,
        // rather than the camera's circle.
        const width = Math.min(window.width, window.height * SELFIE_ASPECT);
        const height = width / SELFIE_ASPECT;
        return (
          <View
            style={{
              position: 'absolute',
              left: (window.width - width) / 2,
              top: (window.height - height) / 2,
              width,
              height,
              borderRadius: REVIEW_RADIUS,
              borderWidth: RIM,
              borderColor: colors.success,
              overflow: 'hidden',
              backgroundColor: '#111111',
            }}
          >
            {/* borderRadius repeated on the Image: iOS does not reliably
                clip an Image to a rounded parent. */}
            <Image
              source={{ uri: selfieUri }}
              resizeMode="cover"
              style={{ width: '100%', height: '100%', borderRadius: REVIEW_RADIUS - RIM }}
            />
            {busy ? (
              <View style={[StyleAbsFill, { backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }]}>
                <UiPulseLoader size={64} />
              </View>
            ) : null}
          </View>
        );
      }}
      above={() => (
        <View style={{ alignItems: 'center' }}>
          <Pill>
            <Icon name="circle-check" size={18} color={colors.success} />
            <View style={{ width: 8 }} />
            <UiText variant="label" style={{ fontWeight: '600', flexShrink: 1 }}>
              {title}
            </UiText>
          </Pill>
        </View>
      )}
      footerReserve={92}
      footer={
        <Panel>
          {/* The line about the photo sits IN this panel, over the buttons,
              not in the space under the window. That space is whatever the
              window leaves, and on a shorter phone it was less than the line
              needs: the note was cut off above the buttons. One line at a
              time: a retry in progress, else the note. */}
          {retryInfo && uploading ? (
            <UiText variant="bodySmall" style={{ textAlign: 'center', marginBottom: spacing.sm }}>
              {`Upload failed, retrying (${retryInfo.attempt}/${retryInfo.total})`}
            </UiText>
          ) : note ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              {soft ? <Icon name="alert" size={16} color={colors.textDark} /> : null}
              <UiText variant="bodySmall" style={{ textAlign: soft ? 'left' : 'center', flex: 1 }}>
                {note}
              </UiText>
            </View>
          ) : null}
          {uploadError ? (
            <UiButton
              label="Try Again"
              disabled={uploading}
              onPress={() => void uploadSelfieAndVideo(selfieUri, videoPathRef.current)}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {done ? null : (
                <View style={{ flex: 1 }}>
                  <UiButton
                    label={t('common.retake')}
                    variant="outline"
                    leadingIcon="refresh"
                    disabled={uploading}
                    onPress={onRetake}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                {/* Disabled and quiet while the photo uploads, never spinning:
                    the one progress mark is in the window, where the work is. */}
                <UiButton
                  label={t('common.continue')}
                  disabled={uploading || !selfieIdRef.current}
                  onPress={onContinue}
                />
              </View>
            </View>
          )}
        </Panel>
      }
    />
  );
}
