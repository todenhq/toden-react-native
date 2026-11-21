import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { useText } from '../../i18n/useText';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { UiPulseLoader } from '../../components/UiPulseLoader';
import { Icon } from '../../components/Icon';
import { CameraBackdrop } from './Backdrop';
import { StyleAbsFill } from './constants';
import { ImmersiveFrame } from './ImmersiveFrame';
import { Panel, Pill } from './ImmersiveSurfaces';
import { SELFIE_DONE_BODY, SELFIE_DONE_TITLE } from './LivenessOutcome';
import { ReviewScene } from './ReviewScene';
import type { SelfieUpload } from './useSelfieUpload';
import { windowOutline } from '../../lib/livenessCutout';
import type { SelfieScene } from '../../lib/selfie-review';

// ---------------------------------------------------------------------------
// The review, full screen: the photo where the camera was, in the same
// window, so it reads as the camera held still rather than as a different
// screen.
//
// What it shows is the still the selfie was cut from, drawn as the camera drew
// it and under the same light blur and tint, moved so the face sits in the
// window and made smaller only if the face would spill over it
// (lib/selfie-review.ts, ./ReviewScene). The window keeps its shape, edged in
// green. Without that still the selfie is shown in the window.
//
// Only with a photo to show. A restored session has the uploaded media id and
// no local file, and keeps the sheet's own review (LivenessComplete).
// ---------------------------------------------------------------------------

/** The window's green edge on the review. */
const RIM = 4;
/** Room round the window for the edge's shadow. */
const RIM_REACH = 8;

export function LivenessReview({
  selfieUri,
  scene,
  soft: reportedSoft = false,
  upload,
  done = false,
  onRetake,
  onContinue,
}: {
  selfieUri: string;
  /** The still the selfie was cut from. Null when there is none. */
  scene: SelfieScene | null;
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
      // The picture goes where the camera went, under the same blur and tint.
      backdrop={(frame, window) => (
        <CameraBackdrop
          frame={frame}
          window={window}
          dimRoom={false}
          camera={window ? <ReviewScene scene={scene} uri={selfieUri} frame={frame} window={window} /> : null}
        />
      )}
      cutout={(window) => {
        // The window's own shape, edged in green, with a soft shadow under
        // the edge drawn in the SVG so Android shows it too.
        const edge = windowOutline(window, RIM / 2).d;
        const box = window.width + RIM_REACH * 2;
        const tall = window.height + RIM_REACH * 2;
        return (
          <>
            <View pointerEvents="none" style={{ position: 'absolute', left: -RIM_REACH, top: -RIM_REACH }}>
              <Svg
                width={box}
                height={tall}
                viewBox={`${-RIM_REACH} ${-RIM_REACH} ${box} ${tall}`}
              >
                <Path d={windowOutline(window, -1).d} fill="none" stroke="rgba(0, 0, 0, 0.16)" strokeWidth={6} />
                <Path d={edge} fill="none" stroke={colors.success} strokeWidth={RIM} />
              </Svg>
            </View>
            {busy ? (
              <View
                style={[
                  StyleAbsFill,
                  {
                    borderRadius: window.width / 2,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
              >
                <UiPulseLoader size={64} />
              </View>
            ) : null}
          </>
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
