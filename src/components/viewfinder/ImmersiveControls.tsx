import React, { useState } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { radius } from '../../config/theme';
import { useTheme } from '../runtime';
import { UiText } from '../Typography';
import { Icon } from '../Icon';
import { CountryFlag } from '../CountryFlag';
import { IMMERSIVE_GLASS, primaryOnDark } from './immersiveGlass';
import { SIDE_MARGIN, TOP_BAR_GAP, TOP_BAR_HEIGHT, topBarTop } from '../../capture/immersiveLayout';

// ---------------------------------------------------------------------------
// The full-screen camera's top bar: back on the left, the document being
// captured in the middle, and which side of it on the right. One row, one
// height, one glass, so the guide below has nothing sitting on its edge.
// ---------------------------------------------------------------------------

/** The glass every top-bar item sits on. */
export const GLASS_SURFACE: ViewStyle = {
  height: TOP_BAR_HEIGHT,
  borderRadius: radius.full,
  borderWidth: 1,
  borderColor: IMMERSIVE_GLASS.border,
  backgroundColor: IMMERSIVE_GLASS.fill,
  flexDirection: 'row',
  alignItems: 'center',
};

/** A guess at the side badge's width until it has been measured. */
const BADGE_WIDTH_GUESS = 96;

function BackButton({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={({ pressed }) => ({
        ...GLASS_SURFACE,
        width: TOP_BAR_HEIGHT,
        justifyContent: 'center',
        backgroundColor: pressed ? IMMERSIVE_GLASS.pressed : IMMERSIVE_GLASS.fill,
      })}
    >
      <Icon name="back" size={20} color={IMMERSIVE_GLASS.text} />
    </Pressable>
  );
}

/**
 * Leaves the whole flow, as the sheet header's X does. Photo mode draws it
 * where the scan draws the side badge: there is no side to name.
 */
export function CloseButton({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      style={({ pressed }) => ({
        ...GLASS_SURFACE,
        width: TOP_BAR_HEIGHT,
        justifyContent: 'center',
        backgroundColor: pressed ? IMMERSIVE_GLASS.pressed : IMMERSIVE_GLASS.fill,
      })}
    >
      <Icon name="close" size={20} color={IMMERSIVE_GLASS.text} />
    </Pressable>
  );
}

/** "FRONT" / "BACK": which face of the document is expected right now. */
export function SideBadge({ side }: { side: 'front' | 'back' }): React.ReactElement {
  const { colors } = useTheme();
  const label = side === 'back' ? 'BACK' : 'FRONT';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={side === 'back' ? 'Back of the document' : 'Front of the document'}
      style={{ ...GLASS_SURFACE, paddingHorizontal: 14, gap: 8 }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: primaryOnDark(colors.primary) }} />
      <UiText variant="label" color={IMMERSIVE_GLASS.text} style={{ fontSize: 14, fontWeight: '600', letterSpacing: 0.8 }}>
        {label}
      </UiText>
    </View>
  );
}

/** Flag + document name, so the person can see WHICH document is expected. */
export function DocumentPill({
  country,
  label,
  maxWidth,
}: {
  country: string;
  label: string;
  maxWidth: number;
}): React.ReactElement {
  return (
    <View style={{ ...GLASS_SURFACE, paddingHorizontal: 14, gap: 8, maxWidth }}>
      {/* The flag carries the country on its own: a name beside it is the
          same fact twice, and it reads faster at a glance than text. */}
      {country ? <CountryFlag country={country} size={20} /> : null}
      <UiText
        variant="label"
        color={IMMERSIVE_GLASS.text}
        numberOfLines={1}
        style={{ fontSize: 15, fontWeight: '600', flexShrink: 1 }}
      >
        {label}
      </UiText>
    </View>
  );
}

/**
 * Back, document and side on one row. In photo mode (no `side`, an `onClose`)
 * the right-hand item is the close button instead of the side badge. The
 * document pill is centred on the screen and is the item that gives way on a
 * narrow phone: it may use the width left between the two sides (the wider of
 * them, mirrored, so it stays centred), and truncates its label past that.
 */
export function TopBar({
  topInset,
  width,
  onBack,
  country,
  documentLabel,
  side,
  onClose,
}: {
  topInset: number;
  width: number;
  onBack: (() => void) | null;
  country: string;
  documentLabel: string;
  /** The scan's side badge. Left out in photo mode. */
  side?: 'front' | 'back';
  /** Photo mode: close the whole flow. Drawn in place of the side badge. */
  onClose?: (() => void) | null;
}): React.ReactElement {
  const [badgeWidth, setBadgeWidth] = useState(BADGE_WIDTH_GUESS);
  // Without the badge, both sides are one 44 button wide.
  const sideWidth = side && !onClose ? Math.max(TOP_BAR_HEIGHT, badgeWidth) : TOP_BAR_HEIGHT;
  const pillMax = Math.max(TOP_BAR_HEIGHT, width - 2 * (SIDE_MARGIN + sideWidth + TOP_BAR_GAP));
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: topBarTop(topInset),
        left: 0,
        right: 0,
        height: TOP_BAR_HEIGHT,
      }}
    >
      {onBack ? (
        <View style={{ position: 'absolute', left: SIDE_MARGIN, top: 0 }}>
          <BackButton onPress={onBack} />
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' }}>
        <DocumentPill country={country} label={documentLabel} maxWidth={pillMax} />
      </View>
      {onClose ? (
        <View style={{ position: 'absolute', right: SIDE_MARGIN, top: 0 }}>
          <CloseButton onPress={onClose} />
        </View>
      ) : side ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: SIDE_MARGIN, top: 0 }}
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            if (w > 0 && w !== badgeWidth) setBadgeWidth(w);
          }}
        >
          <SideBadge side={side} />
        </View>
      ) : null}
    </View>
  );
}
