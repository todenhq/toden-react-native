import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect as SvgRect, Stop } from 'react-native-svg';

import { useTheme } from '../../components/runtime';
import type { Rect, Size } from '../../lib/livenessCutout';
import { sceneFades, sceneOnReview, type SelfieScene } from '../../lib/selfie-review';
import { StyleAbsFill } from './constants';

// ---------------------------------------------------------------------------
// The selfie review's picture, which goes where the camera went (under the
// same light blur and tint, screens/liveness/Backdrop's CameraBackdrop).
//
// With the still the selfie was cut from: the still drawn as the camera drew
// it, moved so the face sits in the window and made smaller only if the face
// would spill over it (lib/selfie-review.ts). An edge the picture no longer
// reaches fades into the background rather than ending in a hard line. No
// mirror: the still was captured mirrored already.
//
// Without it (the face was not known, or the selfie is from an earlier visit
// and only the cut is on the phone): the photo in the window only, so it still
// fits the window, over the plain background.
//
// A port of the web SDK's ReviewView `sceneStyle` and the Flutter SDK's
// screens/liveness_review_scene.dart.
// ---------------------------------------------------------------------------

export function ReviewScene({
  scene,
  uri,
  frame,
  window,
}: {
  scene: SelfieScene | null;
  /** The selfie itself, shown in the window when there is no scene. */
  uri: string;
  frame: Size;
  window: Rect;
}): React.ReactElement {
  const { colors } = useTheme();
  if (!scene) {
    return (
      <View style={[StyleAbsFill, { backgroundColor: colors.background }]}>
        <Image
          source={{ uri }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{
            position: 'absolute',
            left: window.x,
            top: window.y,
            width: window.width,
            height: window.height,
            borderRadius: window.width / 2,
          }}
        />
      </View>
    );
  }
  const at = sceneOnReview(scene, scene.face, frame, window);
  const fades = sceneFades(at, frame);
  return (
    <View style={[StyleAbsFill, { backgroundColor: colors.background, overflow: 'hidden' }]}>
      <Image
        source={{ uri: scene.uri }}
        resizeMode="stretch"
        accessibilityIgnoresInvertColors
        style={{ position: 'absolute', left: at.x, top: at.y, width: at.width, height: at.height }}
      />
      {fades.length > 0 ? (
        <Svg width={frame.width} height={frame.height} style={StyleAbsFill}>
          <Defs>
            {fades.map((f) => (
              <LinearGradient key={f.id} id={`review-fade-${f.id}`} x1={f.from.x} y1={f.from.y} x2={f.to.x} y2={f.to.y}>
                <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
              </LinearGradient>
            ))}
          </Defs>
          {fades.map((f) => (
            <SvgRect
              key={f.id}
              x={f.box.x}
              y={f.box.y}
              width={f.box.width}
              height={f.box.height}
              fill={`url(#review-fade-${f.id})`}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
