import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, View, type DimensionValue } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { radius } from '../../config/theme';
import { useTheme } from '../runtime';
import { useText } from '../../i18n';
import { UiText } from '../Typography';
import { Icon, type IconName } from '../Icon';
import { Spinner } from '../Spinner';
import { IMMERSIVE_GLASS, primaryOnDark, type HintTone } from './immersiveGlass';
import {
  BOTTOM_OFFSET,
  BOTTOM_ROW_HEIGHT,
  CAPTION_GAP,
  CAPTION_LINE_HEIGHT,
  HINT_LINE_HEIGHT,
  HINT_MAX_LINES,
  HINT_PADDING_V,
  SHUTTER_SIZE,
  SIDE_BUTTON_SIZE,
  SIDE_MARGIN,
} from '../../capture/immersiveLayout';

/**
 * Three equal slots across the row, so the shutter stays centred whether or
 * not the upload and torch buttons are shown.
 */
const SLOT = { flex: 1, height: SHUTTER_SIZE, alignItems: 'center', justifyContent: 'center' } as const;

/** Grows the 52 side buttons to a 60 target. */
const SIDE_HIT_SLOP = 4;

// Short captions under the side buttons. Hard-coded beside the other fixed
// camera strings ("Capture photo", "Go back"): a catalogue key would have to be
// added to the shared customisable-texts contract, which every SDK must match.
const UPLOAD_CAPTION = 'Upload';
const TORCH_CAPTION_OFF = 'Light';
const TORCH_CAPTION_ON = 'Light on';
const UPLOAD_HINT = 'Choose a photo of your document instead of using the camera.';

const TONE_ICON: Record<HintTone, IconName> = {
  neutral: 'scan-line',
  action: 'info',
  ready: 'circle-check',
  warning: 'alert',
};

/**
 * The capture gate's live instruction, on the glass. The icon's colour carries
 * the state, so the words stay white and legible over any scene.
 */
export function HintPill({
  hint,
  tone,
  maxWidth,
}: {
  hint: string;
  tone: HintTone;
  maxWidth: DimensionValue;
}): React.ReactElement {
  const { colors } = useTheme();
  const toneColour =
    tone === 'ready'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'action'
          ? primaryOnDark(colors.primary)
          : 'rgba(255,255,255,0.7)';

  // VoiceOver has no live regions: say a new instruction as it arrives.
  const said = useRef(hint);
  useEffect(() => {
    if (said.current === hint) return;
    said.current = hint;
    if (Platform.OS === 'ios' && hint) AccessibilityInfo.announceForAccessibility(hint);
  }, [hint]);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={hint}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        maxWidth,
        paddingHorizontal: 16,
        paddingVertical: HINT_PADDING_V,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: IMMERSIVE_GLASS.border,
        backgroundColor: IMMERSIVE_GLASS.fill,
      }}
    >
      <Icon name={TONE_ICON[tone]} size={16} color={toneColour} />
      <UiText
        variant="label"
        color={IMMERSIVE_GLASS.text}
        numberOfLines={HINT_MAX_LINES}
        style={{ fontSize: 15, lineHeight: HINT_LINE_HEIGHT, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}
      >
        {hint}
      </UiText>
    </View>
  );
}

/** A round glass button beside the shutter, with its caption hanging below. */
function SideButton({
  icon,
  caption,
  label,
  hint,
  lit,
  onPress,
}: {
  icon: IconName;
  caption: string;
  label: string;
  hint?: string;
  /** Solid white when on, so "on" never depends on the scene behind it. */
  lit?: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  return (
    <View style={{ width: SIDE_BUTTON_SIZE, height: SIDE_BUTTON_SIZE }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={lit === undefined ? undefined : { selected: lit }}
        hitSlop={SIDE_HIT_SLOP}
        style={({ pressed }) => ({
          width: SIDE_BUTTON_SIZE,
          height: SIDE_BUTTON_SIZE,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: lit ? '#FFFFFF' : IMMERSIVE_GLASS.border,
          backgroundColor: lit
            ? pressed
              ? 'rgba(255,255,255,0.82)'
              : '#FFFFFF'
            : pressed
              ? IMMERSIVE_GLASS.pressed
              : IMMERSIVE_GLASS.fill,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <Icon name={icon} size={22} color={lit ? colors.primary : IMMERSIVE_GLASS.text} />
      </Pressable>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          position: 'absolute',
          top: SIDE_BUTTON_SIZE + CAPTION_GAP,
          left: -SIDE_BUTTON_SIZE,
          right: -SIDE_BUTTON_SIZE,
          alignItems: 'center',
        }}
      >
        <UiText
          variant="bodySmall"
          color={IMMERSIVE_GLASS.caption}
          numberOfLines={1}
          style={{ fontSize: 12, lineHeight: CAPTION_LINE_HEIGHT, fontWeight: '500' }}
        >
          {caption}
        </UiText>
      </View>
    </View>
  );
}

/** Upload, shutter and torch, in three equal slots along the bottom. */
export function BottomBar({
  allowUpload,
  onUpload,
  onCapture,
  busy,
  ready: cameraReady,
  progress,
  blockedHint = null,
  hasTorch,
  torch,
  onToggleTorch,
  bottomInset,
  shutterIcon = 'scan-line',
  uploadHint = UPLOAD_HINT,
}: {
  allowUpload: boolean;
  onUpload: () => void;
  onCapture: () => void;
  busy: boolean;
  ready: boolean;
  progress: number;
  /** Set while the four-corner gate holds capture: the shutter is disabled and says why. */
  blockedHint?: string | null;
  hasTorch: boolean;
  torch: boolean;
  onToggleTorch: () => void;
  bottomInset: number;
  /** The glyph inside the shutter: the scan's by default, a camera in photo mode. */
  shutterIcon?: IconName;
  /** The upload button's screen-reader hint, for a photo that is not of a document. */
  uploadHint?: string;
}): React.ReactElement {
  const { colors } = useTheme();
  const t = useText();
  const ready = cameraReady && !blockedHint;
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const ring = SHUTTER_SIZE + 8;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: SIDE_MARGIN,
        right: SIDE_MARGIN,
        bottom: bottomInset + BOTTOM_OFFSET,
        height: BOTTOM_ROW_HEIGHT,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <View style={SLOT}>
        {allowUpload ? (
          <SideButton
            icon="image"
            caption={UPLOAD_CAPTION}
            label={t('uploadDocument.camera.uploadInstead')}
            hint={uploadHint}
            onPress={onUpload}
          />
        ) : null}
      </View>

      <View style={SLOT}>
        {/* The dwell, drawn around the shutter: someone holding steady can see
            it working instead of wondering whether to press. */}
        {progress > 0 && progress < 1 ? (
          <Svg width={ring} height={ring} style={{ position: 'absolute', top: -4 }}>
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={R}
              stroke={colors.primary}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
              transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
            />
          </Svg>
        ) : null}
        <Pressable
          onPress={onCapture}
          disabled={busy || !ready}
          accessibilityRole="button"
          accessibilityLabel={blockedHint ? `Capture photo. ${blockedHint}` : 'Capture photo'}
          accessibilityState={{ disabled: busy || !ready }}
          style={({ pressed }) => ({
            width: SHUTTER_SIZE,
            height: SHUTTER_SIZE,
            borderRadius: radius.full,
            borderWidth: 4,
            borderColor: '#FFFFFF',
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 62,
              height: 62,
              borderRadius: radius.full,
              backgroundColor: ready ? colors.primary : colors.gray400,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {busy ? <Spinner color="#FFFFFF" /> : <Icon name={shutterIcon} size={26} color="#FFFFFF" />}
          </View>
        </Pressable>
      </View>

      <View style={SLOT}>
        {hasTorch ? (
          <SideButton
            icon={torch ? 'zap' : 'zap-off'}
            caption={torch ? TORCH_CAPTION_ON : TORCH_CAPTION_OFF}
            label={torch ? 'Turn off the torch' : 'Turn on the torch'}
            lit={torch}
            onPress={onToggleTorch}
          />
        ) : null}
      </View>
    </View>
  );
}
