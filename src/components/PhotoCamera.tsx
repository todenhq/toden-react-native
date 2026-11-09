import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, View, useWindowDimensions } from 'react-native';

import { spacing } from '../config/theme';
import { useTheme, useVerificationConfig } from './runtime';
import { Spinner } from './Spinner';
import {
  CameraPermissionPrimingView,
  CameraPermissionView,
  CameraUnavailableView,
} from './CameraPermissionView';
import { TopBar } from './viewfinder/ImmersiveControls';
import { PhotoViewfinder } from './viewfinder/PhotoViewfinder';
import { cameraBottomInset, cameraTopInset } from './viewfinder/cameraInsets';
import { createExitQueue, type CapturedPhoto } from './viewfinder/photoMode';
import { useFlowClose } from './flowClose';
import { useDocumentCamera } from '../screens/document/useDocumentCamera';

export type { CapturedPhoto } from './viewfinder/photoMode';

// ---------------------------------------------------------------------------
// "Take a photo" inside the SDK: the full-screen document camera's look, minus
// the scanning (components/viewfinder/photoMode.ts). Used where the flow wants
// a plain photo (a supporting document, a proof of address, the entrance) and
// used to hand over to the system camera.
//
// A full-screen Modal of its own, as the scan's CameraPhase is: the step under
// it keeps its state, and the camera has every pixel. The caller owns `open`
// and gets the photo back in the shape the system camera gave, so its existing
// shrink-then-size-check and upload run unchanged.
// ---------------------------------------------------------------------------

export interface PhotoCameraProps {
  open: boolean;
  /** What is being photographed, in the top bar's centre pill. */
  title: string;
  /** An optional neutral instruction under the top bar. Never changes live. */
  instruction?: string | null;
  /** A plain frame of this aspect (width / height). None unless asked for. */
  guideAspect?: number | null;
  /** The still, as taken. The camera has already started to close. */
  onPhoto: (photo: CapturedPhoto) => void;
  /** The caller's own library or file picker. Hidden when left out. */
  onUpload?: (() => void) | null;
  /** Hide the camera (the caller sets `open` false). Back and capture use it too. */
  onDismiss: () => void;
}

export function PhotoCamera(p: PhotoCameraProps): React.ReactElement {
  const flowClose = useFlowClose();
  // The follow-up to leaving (opening the library, closing the flow) waits for
  // the modal to have gone on iOS; see createExitQueue.
  const exits = useRef(createExitQueue(Platform.OS === 'ios')).current;
  // The camera stays mounted until the modal has finished leaving, so the fade
  // shows the preview rather than a black frame. Only mounted once opened, so a
  // step that never opens it never touches VisionCamera.
  const [mounted, setMounted] = useState(p.open);
  useEffect(() => {
    if (p.open) setMounted(true);
    else if (Platform.OS !== 'ios') setMounted(false);
  }, [p.open]);

  const back = (): void => exits.leave(p.onDismiss);
  const close = flowClose ? (): void => exits.leave(p.onDismiss, flowClose) : null;
  const upload = p.onUpload ? (): void => exits.leave(p.onDismiss, p.onUpload) : null;
  const photo = (taken: CapturedPhoto): void => {
    exits.leave(p.onDismiss);
    p.onPhoto(taken);
  };

  return (
    <Modal
      visible={p.open}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={back}
      onDismiss={() => {
        setMounted(false);
        exits.dismissed();
      }}
    >
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {mounted ? (
          <PhotoCameraBody
            active={p.open}
            title={p.title}
            instruction={p.instruction}
            guideAspect={p.guideAspect}
            onPhoto={photo}
            onBack={back}
            onClose={close}
            onUpload={upload}
          />
        ) : null}
      </View>
    </Modal>
  );
}

/** The permission states, then the viewfinder: the scan's own handling. */
function PhotoCameraBody(p: {
  active: boolean;
  title: string;
  instruction?: string | null;
  guideAspect?: number | null;
  onPhoto: (photo: CapturedPhoto) => void;
  onBack: () => void;
  onClose: (() => void) | null;
  onUpload: (() => void) | null;
}): React.ReactElement {
  const config = useVerificationConfig();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const camera = useDocumentCamera(config.onError);
  const topInset = cameraTopInset();

  if (camera.perm === 'granted' && camera.hasDevice) {
    return (
      <PhotoViewfinder
        active={p.active}
        title={p.title}
        instruction={p.instruction}
        guideAspect={p.guideAspect}
        onPhoto={p.onPhoto}
        onBack={p.onBack}
        onClose={p.onClose}
        onUpload={p.onUpload}
        topInset={topInset}
        bottomInset={cameraBottomInset()}
      />
    );
  }

  // Before the camera runs: the same screens the scan shows, each with the way
  // out (back, close) the camera itself would have.
  let content: React.ReactElement;
  if (camera.cameraUnavailable) {
    content = <CameraUnavailableView onUpload={p.onUpload ?? undefined} />;
  } else if (camera.showPrimer) {
    content = <CameraPermissionPrimingView onGrant={camera.requestAccess} />;
  } else if (camera.permissionDenied) {
    content = <CameraPermissionView onRetry={camera.requestAccess} onUpload={p.onUpload ?? undefined} />;
  } else {
    content = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: topInset + 64,
          paddingBottom: cameraBottomInset(),
        }}
      >
        {content}
      </View>
      <TopBar topInset={topInset} width={width} onBack={p.onBack} country="" documentLabel={p.title} onClose={p.onClose} />
    </View>
  );
}
