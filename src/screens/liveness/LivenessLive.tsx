import React from 'react';
import { View as RNView, type View } from 'react-native';
import type { CameraDevice, CameraViewProps } from 'react-native-vision-camera';

import { spacing } from '../../config/theme';
import { useTheme } from '../../components/runtime';
import { UiText } from '../../components/Typography';
import { UiButton } from '../../components/UiButton';
import { ROOM_FOR_LIGHTING_NOTE, type Size } from '../../lib/livenessCutout';
import type { NarratorGesture } from '../../liveness/narratorPose';
import { lightingGuidanceText, type useLiveness } from '../../liveness/useLiveness';
import { AttemptsLeftNotice } from './AttemptsLeftNotice';
import { GestureNarrator } from './GestureNarrator';
import { ImmersiveFrame } from './ImmersiveFrame';
import { backdropNeedsTexture, CameraBackdrop } from './Backdrop';
import { Panel, Reassurance, StepCount } from './ImmersiveSurfaces';
import { InstructionPill } from './InstructionPill';
import { LightingBanner } from './LightingBanner';
import { LivenessCamera } from './LivenessCamera';
import { LivenessWindow } from './LivenessWindow';

// ---------------------------------------------------------------------------
// The live liveness camera, full screen: the camera edge to edge, sharp in a
// window for the face and blurred everywhere around it, the instruction above the window and
// the step count below.
//
// A check that runs out of time stays on this screen, as it does on Flutter:
// the camera keeps running, and the reason and Try Again take the place of the
// step count. Sending the person to a different screen to press one button
// tore down the camera they were about to need again.
//
// A gesture is asked for in words, and (unless the workflow turns it off) a
// face icon pops up in the window, acts it out once and goes
// (GestureNarrator). A head direction also lights its side of the line round
// the window, which turns green when it is done (SideRing); the step count is
// then for screen readers only, the line showing the progress. The words stand ABOVE the window: the front camera is at
// the top of the phone, so eyes that go up to read stay near the lens, while
// eyes that drop to the bottom of the screen tip the head down, which is the
// wrong pose for the photo and for a nod being judged.
// ---------------------------------------------------------------------------

export function LivenessLive({
  liveness,
  guidance,
  device,
  cameraActive,
  outputs,
  getRingTarget,
  windowRef,
  dimRoom,
  failure,
  narratedGesture,
  onFrameSize,
  onCameraStarted,
}: {
  liveness: ReturnType<typeof useLiveness>;
  guidance: { text: string; tone: 'normal' | 'error' };
  device: CameraDevice | undefined;
  cameraActive: boolean;
  outputs: NonNullable<CameraViewProps['outputs']>;
  /** The camera's session is running (liveness/depthFrame.ts enables depth then). */
  onCameraStarted?: () => void;
  getRingTarget: () => number;
  windowRef: React.RefObject<View | null>;
  dimRoom: boolean;
  /**
   * Why the check stopped, with its retry, or null while it is running. `note`
   * is the attempts left, shown as a small warning under the reason.
   */
  failure: { message: string; note?: string | null; onRetry: () => void } | null;
  /** The gesture the narrator acts out in the window, or null for none
   *  (liveness/narratorPose.ts narratedGesture). */
  narratedGesture: NarratorGesture | null;
  onFrameSize: (size: Size) => void;
}): React.ReactElement {
  const { colors } = useTheme();
  const phase = liveness.phase;
  const loading = phase === 'loading';
  const warning =
    liveness.wrongGesture ||
    liveness.multipleFaces ||
    liveness.positionGuidance != null ||
    liveness.lightingGuidance != null;
  const tone =
    guidance.tone === 'error'
      ? 'warning'
      : phase === 'challenge_passed' || phase === 'complete'
        ? 'done'
        : 'prompt';
  // Where the test has got to, in words, where the sheet has its dots.
  const total = liveness.totalCount;
  const showsCount = !failure && total > 1 && (phase === 'challenge' || phase === 'challenge_passed');
  const step = Math.min(liveness.completedCount + (phase === 'challenge' ? 1 : 0), total);
  // The line about the connection stays until the photo is taken. It used to
  // go as soon as a gesture was asked for, which left it on screen for about a
  // second and a half: too short to be read at all.
  const beforeCapture = phase !== 'complete';
  const lighting = liveness.lightingGuidance;

  return (
    <ImmersiveFrame
      onSize={onFrameSize}
      backdrop={(frame, window) => (
        <CameraBackdrop
          frame={frame}
          window={window}
          dimRoom={dimRoom}
          camera={
            <LivenessCamera
              device={device}
              active={cameraActive}
              outputs={outputs}
              texture={backdropNeedsTexture}
              onStarted={onCameraStarted}
            />
          }
        />
      )}
      cutout={(window) => (
        <LivenessWindow
          window={window}
          phase={phase}
          warning={warning && !loading}
          loading={loading}
          getRingTarget={getRingTarget}
          // Positioning, each step, the capture: livenessProgress's own parts.
          segments={liveness.totalCount + 2}
          sides={liveness.directionSides}
          windowRef={windowRef}
        >
          <GestureNarrator
            gesture={failure ? null : narratedGesture}
            respondedAtRef={liveness.respondedAtRef}
            showAgain={liveness.wrongWayCount}
            window={window}
          />
        </LivenessWindow>
      )}
      above={(room) => {
        if (failure) return null;
        // The long lighting note is wide, so it only shows when it fits under
        // the back and close buttons with the instruction.
        const showsLighting = lighting != null && room >= ROOM_FOR_LIGHTING_NOTE;
        return (
          <RNView style={{ alignItems: 'center', gap: spacing.sm }}>
            {showsLighting && lighting ? (
              <LightingBanner text={lightingGuidanceText(lighting)} />
            ) : null}
            <InstructionPill text={phase === 'flash' ? '' : guidance.text} tone={tone} />
          </RNView>
        );
      }}
      below={
        !failure && showsCount ? (
          <StepCount step={step} total={total} visuallyHidden={!!liveness.directionSides} />
        ) : undefined
      }
      // A failed check rests its panel on the bottom edge at its full height.
      // Squeezed into the strip under the window it was cut off on a short
      // phone; the window has nothing left to show, so the panel may cover its
      // lower edge.
      footer={
        failure ? (
          // Its own surface: red text straight on the camera would be lost.
          <RNView style={{ alignSelf: 'stretch' }}>
            <Panel>
              {/* One alert, so the reason and the attempts left are read together. */}
              <RNView accessible accessibilityRole="alert" style={{ gap: spacing.sm }}>
                <UiText variant="bodyMedium" color={colors.error} style={{ textAlign: 'center', fontWeight: '500' }}>
                  {failure.message}
                </UiText>
                {failure.note ? <AttemptsLeftNotice text={failure.note} /> : null}
              </RNView>
              <RNView style={{ height: spacing.md }} />
              <UiButton label="Try Again" onPress={failure.onRetry} />
            </Panel>
          </RNView>
        ) : (
          <Reassurance visible={beforeCapture} />
        )
      }
    />
  );
}
