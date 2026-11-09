import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../runtime';
import { ImmersiveGuide } from './ImmersiveGuide';
import { guideRect, immersiveBand } from '../../capture/documentTurn';
import { TurnOverPrompt } from './TurnOverPrompt';
import type { DocumentSpecimenSubject } from './DocumentGhost';
import { TopBar } from './ImmersiveControls';
import { BottomBar, HintPill } from './ImmersiveBottomBar';
import type { HintTone } from './immersiveGlass';
import { hintTop } from '../../capture/immersiveLayout';
import { TURNED_HINT_ROTATION, turnedHintBox } from '../../capture/turnedHint';
import type { DocumentFraming } from '../../capture';

/**
 * Everything drawn over the full-screen camera.
 *
 * Composed here rather than in CameraViewfinder so that file stays about camera
 * wiring — and so the immersive layout can be read in one place against the
 * Flutter screen it mirrors.
 */
export function ImmersiveOverlay(p: {
  side: 'front' | 'back';
  country: string;
  documentLabel: string;
  guideAspect: number;
  hint: string;
  hintIsAction: boolean;
  /** The colour of the instruction's icon (immersiveHintTone). Defaults from `hintIsAction`. */
  hintTone?: HintTone;
  progress: number;
  busy: boolean;
  torch: boolean;
  hasTorch: boolean;
  onToggleTorch: () => void;
  onCapture: () => void;
  /** The corner gate's instruction while it holds the shutter, else null. */
  blockedHint: string | null;
  onBack: (() => void) | null;
  onUpload: (() => void) | null;
  bottomInset: number;
  width: number;
  height: number;
  topInset: number;
  framing: DocumentFraming;
  /** The ID being captured, drawn as the sample document in the guide. */
  subject: DocumentSpecimenSubject;
  /** This side followed the last with no tap: the prompt has shown it already. */
  turnedOver: boolean;
  /** The camera is waiting for the person to turn the document over. */
  turning: boolean;
  onTurned: () => void;
}): React.ReactElement {
  const { colors } = useTheme();
  // An upright guide (a turned NIN slip) keeps clear of the controls.
  const band = p.guideAspect < 1 ? immersiveBand(p.topInset, p.bottomInset) : undefined;
  const guide = guideRect(p.width, p.height, p.guideAspect, band);
  // A turned guide turns the hint with it (capture/turnedHint.ts).
  const turnedHint = p.guideAspect < 1 && !p.turning ? turnedHintBox(guide) : null;
  const tone: HintTone = p.hintTone ?? (p.hintIsAction ? 'action' : 'neutral');
  return (
    <>
      <ImmersiveGuide
        guideAspect={p.guideAspect}
        primary={colors.primary}
        width={p.width}
        height={p.height}
        framing={p.framing}
        subject={p.subject}
        showSpecimen={!p.turnedOver}
        band={band}
      />
      {p.turning ? (
        <TurnOverPrompt
          x={guide.x}
          y={guide.y}
          width={guide.width}
          height={guide.height}
          aspect={p.guideAspect}
          accent={colors.primary}
          subject={p.subject}
          onDone={p.onTurned}
        />
      ) : null}
      <TopBar
        topInset={p.topInset}
        width={p.width}
        onBack={p.onBack}
        country={p.country}
        documentLabel={p.documentLabel}
        side={p.side}
      />
      {/* The instruction, under the top bar; beside a turned guide instead. */}
      {!p.turning && !turnedHint ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: hintTop(p.topInset), left: 0, right: 0, alignItems: 'center' }}
        >
          <HintPill hint={p.hint} tone={tone} maxWidth="88%" />
        </View>
      ) : null}
      {turnedHint ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: turnedHint.left,
            top: turnedHint.top,
            width: turnedHint.width,
            height: turnedHint.height,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: TURNED_HINT_ROTATION }],
          }}
        >
          <HintPill hint={p.hint} tone={tone} maxWidth="100%" />
        </View>
      ) : null}
      {p.turning ? null : (
        <BottomBar
          allowUpload={!!p.onUpload}
          onUpload={() => p.onUpload?.()}
          onCapture={p.onCapture}
          busy={p.busy}
          ready
          blockedHint={p.blockedHint}
          progress={p.progress}
          hasTorch={p.hasTorch}
          torch={p.torch}
          onToggleTorch={p.onToggleTorch}
          bottomInset={p.bottomInset}
        />
      )}
    </>
  );
}
