import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, Modal, PanResponder, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { radius } from '../config/theme';
import { cropImage, imageSize, rotateImage } from '../services/mediaCompress';
import { tapHaptic } from '../services/haptics';
import { documentCropGuide, undoDegrees } from '../capture/documentTurn';
import { clampCropRect, insetContainRect, initialCropRect, quarterTurnScale, turnedSize, type CropRectangle } from '../lib/documentCropGeometry';
import { IMMERSIVE_GLASS } from './viewfinder/immersiveGlass';
import {
  BOTTOM_OFFSET,
  CAPTION_GAP,
  CAPTION_LINE_HEIGHT,
  GUIDE_GAP_ABOVE_CONTROLS,
  SIDE_BUTTON_SIZE,
  SIDE_MARGIN,
  TOP_BAR_GAP,
  TOP_BAR_HEIGHT,
  TOP_BAR_OFFSET,
} from '../capture/immersiveLayout';
import { UiText } from './Typography';
import { Icon } from './Icon';
import { useTheme } from './runtime';
import { useText } from '../i18n/useText';
import { Spinner } from './Spinner';
import { useReduceMotion } from './StaggerIn';

// Interactive ID-card cropper, a port of the Flutter SDK's
// _DocumentCropperScreen. Shown after picking a document photo from the gallery:
// a draggable, fixed-aspect (ISO ID-1) crop box over the image. It looks like
// the full-screen scan screen it opens from: a black editor stage, the same
// dark glass controls, the same 8pt rhythm (capture/immersiveLayout.ts).
//
// ISO/IEC 7810 ID-1: 85.6 mm × 53.98 mm → AR ≈ 1.5858, the default box. A
// document of another shape passes its own (`aspect`), so a long NIN slip is
// not cut down to a card. On a stage taller than wide (a phone held upright)
// the slip's box stands upright, as its camera guide does: the same rule
// (documentCropGuide in capture/documentTurn.ts) on the same kind of input, the
// box this screen measured, and the crop is turned back to landscape before it
// is returned, as an upright capture is. Rotate turns the photo a quarter
// clockwise at a time (so a sideways photo can be stood up to fit the box), and
// the box is fitted afresh to the turned photo. Geometry: lib/documentCropGeometry.ts.
const ID_AR = 85.6 / 53.98;
const HANDLE_RADIUS = 28; // touch radius for the corner handles (a 56 target)
const EDGE_TARGET = 22; // half of the 44 target around each mid-edge bar
const ARM = 22; // corner-bracket arm length
const HANDLE_THICKNESS = 4;
const EDGE_BAR = 20; // mid-edge bar length
const GRID_FADE_MS = 150;
const TURN_MS = 280; // Rotate's quarter turn on screen
const FRAME_OUT_MS = 120; // the crop frame leaving as a turn starts
const FRAME_IN_MS = 150; // and returning, refitted, as it ends

/** A camera editor's stage: the photo reads against pure black. */
export const CROPPER_STAGE = '#000000';
const DIM = 'rgba(0,0,0,0.6)';
const GRID = 'rgba(255,255,255,0.35)';
const HELP = 'rgba(255,255,255,0.7)';

// Fixed strings beside the existing hard-coded "Cancel", as the scan screen's
// captions are: a catalogue key would have to join the shared customisable-texts
// contract that every SDK must match.
const HELP_TEXT = 'Drag the corners to the edges of your ID';
const ROTATE_HINT = 'Turns the photo a quarter turn clockwise.';

/** The cropper is a full-screen Modal, so it clears the status bar and home indicator itself. */
function safeInsets(): { top: number; bottom: number } {
  const sa = initialWindowMetrics?.insets;
  if (Platform.OS === 'android') return { top: StatusBar.currentHeight ?? sa?.top ?? 24, bottom: sa?.bottom ?? 0 };
  return { top: sa?.top || 47, bottom: sa?.bottom ?? 34 };
}

type Rectangle = CropRectangle;

type Handle = 'none' | 'move' | 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';

export interface DocumentCropperProps {
  uri: string;
  onCancel: () => void;
  /** The cropped photo, turned back to landscape when its box stood upright. */
  onConfirm: (croppedUri: string) => void;
  /** The document's own width ÷ height (landscape). Defaults to an ID card. */
  aspect?: number;
  /** The selected ID type's name, for the title ("Fit your NIN slip in the frame"). */
  documentLabel?: string;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** The title: the document by name when it is known. */
export function cropperTitle(documentLabel?: string): string {
  const label = documentLabel?.trim();
  return label ? `Fit your ${label} in the frame` : 'Fit your ID in the frame';
}

export function DocumentCropper({
  uri,
  onCancel,
  onConfirm,
  aspect: documentAspect = ID_AR,
  documentLabel,
}: DocumentCropperProps): React.ReactElement {
  // The picked photo's own size, before any Rotate.
  const [original, setOriginal] = useState<{ w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Rectangle | null>(null);
  const [processing, setProcessing] = useState(false);
  // Clockwise quarter turns from Rotate, and the photo as turned.
  const [turns, setTurns] = useState(0);
  const [shownUri, setShownUri] = useState(uri);
  const [rotating, setRotating] = useState(false);
  // Decided once, from the first stage this screen measured, so turning the
  // phone mid-crop does not reshape a box already placed.
  const [guide, setGuide] = useState<{ aspect: number; turned: boolean } | null>(null);
  const aspect = guide?.aspect ?? documentAspect;
  const natural = original ? turnedSize(original, turns) : null;
  const { colors } = useTheme();
  const t = useText();
  const insets = useMemo(safeInsets, []);

  // The rule-of-thirds grid shows only while a handle or the box is held.
  const [dragging, setDragging] = useState(false);
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    const to = dragging ? 1 : 0;
    if (reduceMotion) {
      gridOpacity.setValue(to);
      return;
    }
    const anim = Animated.timing(gridOpacity, { toValue: to, duration: GRID_FADE_MS, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [dragging, reduceMotion, gridOpacity]);

  // Pan state held in refs so the PanResponder callbacks stay stable.
  const handleRef = useRef<Handle>('none');
  const cropAtStart = useRef<Rectangle | null>(null);
  const cropRef = useRef<Rectangle | null>(null);
  cropRef.current = crop;

  useEffect(() => {
    let alive = true;
    imageSize(uri)
      .then(({ width, height }) => {
        if (alive) setOriginal({ w: width, h: height });
      })
      .catch(() => undefined); // fall through: confirm is gated on `natural`
    return () => {
      alive = false;
    };
  }, [uri]);

  const naturalW = natural?.w ?? 0;
  const naturalH = natural?.h ?? 0;
  // Letterboxed inside the stage with a 16 margin, so no handle meets the screen edge.
  const imgRect = useMemo<Rectangle | null>(() => {
    if (!naturalW || !naturalH || !container) return null;
    return insetContainRect(naturalW, naturalH, container.w, container.h);
  }, [naturalW, naturalH, container]);

  // Place the box once the image rect and its shape are known (again after a Rotate).
  useEffect(() => {
    if (imgRect && guide && !crop) setCrop(initialCropRect(imgRect, guide.aspect));
  }, [imgRect, guide, crop]);

  // ── Rotate, animated ──────────────────────────────────────────────────────
  // The photo as shown turns a quarter on screen (native driver) while the
  // real turn is made from the original in the background. The turning copy
  // sits over the stage and holds its final pose until the turned file has
  // loaded underneath, then gives way to it: no snap, no blank frame. The crop
  // frame fades out as the turn starts and back in, refitted, as it ends. One
  // turn at a time: presses during a turn are ignored.
  const [turning, setTurning] = useState<{ uri: string; rect: Rectangle; scale: number; ready: boolean } | null>(null);
  const turnAnim = useRef(new Animated.Value(0)).current;
  const frameOpacity = useRef(new Animated.Value(1)).current;
  const turnBusy = useRef(false);
  const swapPending = useRef(false);
  const spinStart = useRef<(() => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // Starts the on-screen turn, once the turning copy has drawn (or after a short wait).
  const startSpin = () => {
    const go = spinStart.current;
    spinStart.current = null;
    go?.();
  };

  const endTurn = () => {
    if (!turnBusy.current || !alive.current) return;
    swapPending.current = false;
    spinStart.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTurning(null);
    setRotating(false);
    turnBusy.current = false;
  };

  // After the turned photo has taken over: back to rest, and the frame returns.
  useEffect(() => {
    if (turning) return;
    turnAnim.setValue(0);
    if (reduceMotion) frameOpacity.setValue(1);
    else Animated.timing(frameOpacity, { toValue: 1, duration: FRAME_IN_MS, useNativeDriver: true }).start();
  }, [turning, turnAnim, frameOpacity, reduceMotion]);

  const rotate = async () => {
    if (turnBusy.current || rotating || processing || !original || !container || !imgRect) return;
    turnBusy.current = true;
    tapHaptic();
    const next = (turns + 1) % 4;
    const target = turnedSize(original, next);
    const to = insetContainRect(target.w, target.h, container.w, container.h);
    setRotating(true);
    setTurning({ uri: shownUri, rect: imgRect, scale: quarterTurnScale(imgRect, to), ready: false });
    if (reduceMotion) frameOpacity.setValue(0);
    else Animated.timing(frameOpacity, { toValue: 0, duration: FRAME_OUT_MS, useNativeDriver: true }).start();

    const spun = new Promise<void>((resolve) => {
      spinStart.current = () => {
        setTurning((tn) => (tn ? { ...tn, ready: true } : tn));
        // Reduced motion: no turn on screen, the photo is swapped once ready.
        if (reduceMotion) return resolve();
        Animated.timing(turnAnim, {
          toValue: 1,
          duration: TURN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => resolve());
      };
    });
    later(startSpin, 250);

    // From the original each time, so going round never re-encodes a re-encode.
    let turned: string | null;
    try {
      turned = next === 0 ? uri : await rotateImage(uri, next * 90);
    } catch {
      turned = null;
    }
    await spun;
    if (!alive.current) return;
    if (turned === null) {
      // The photo stays as it was; the person can still crop it.
      if (reduceMotion) return endTurn();
      Animated.timing(turnAnim, { toValue: 0, duration: FRAME_OUT_MS * 1.5, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => endTurn());
      return;
    }
    swapPending.current = true;
    setShownUri(turned);
    setTurns(next);
    setCrop(null);
    // The turned photo's onLoad ends the turn; this only guards a load that never reports.
    later(endTurn, 1500);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const c = cropRef.current;
          // No dragging a frame that is hidden for a turn.
          if (!c || turnBusy.current) {
            handleRef.current = 'none';
            return;
          }
          const px = evt.nativeEvent.locationX;
          const py = evt.nativeEvent.locationY;
          const midX = c.x + c.w / 2;
          const midY = c.y + c.h / 2;
          const near = (x: number, y: number) => Math.abs(px - x) < EDGE_TARGET && Math.abs(py - y) < EDGE_TARGET;
          let h: Handle = 'none';
          if (dist(px, py, c.x, c.y) < HANDLE_RADIUS) h = 'tl';
          else if (dist(px, py, c.x + c.w, c.y) < HANDLE_RADIUS) h = 'tr';
          else if (dist(px, py, c.x, c.y + c.h) < HANDLE_RADIUS) h = 'bl';
          else if (dist(px, py, c.x + c.w, c.y + c.h) < HANDLE_RADIUS) h = 'br';
          else if (near(midX, c.y)) h = 't';
          else if (near(c.x + c.w, midY)) h = 'r';
          else if (near(midX, c.y + c.h)) h = 'b';
          else if (near(c.x, midY)) h = 'l';
          else if (px >= c.x - 8 && px <= c.x + c.w + 8 && py >= c.y - 8 && py <= c.y + c.h + 8) h = 'move';
          handleRef.current = h;
          cropAtStart.current = c;
          if (h !== 'none') {
            setDragging(true);
            tapHaptic();
          }
        },
        onPanResponderMove: (_evt, g) => {
          const start = cropAtStart.current;
          const bounds = imgRect;
          const h = handleRef.current;
          if (!start || !bounds || h === 'none') return;
          const dx = g.dx;
          const dy = g.dy;
          const bottom = start.y + start.h;
          let next: Rectangle;
          switch (h) {
            case 'move':
              next = { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h };
              break;
            case 'br': {
              const w = start.w + dx;
              next = { x: start.x, y: start.y, w, h: w / aspect };
              break;
            }
            case 'bl': {
              const w = start.w - dx;
              next = { x: start.x + dx, y: start.y, w, h: w / aspect };
              break;
            }
            case 'tr': {
              const w = start.w + dx;
              const hh = w / aspect;
              next = { x: start.x, y: bottom - hh, w, h: hh };
              break;
            }
            case 'tl': {
              const w = start.w - dx;
              const hh = w / aspect;
              next = { x: start.x + dx, y: bottom - hh, w, h: hh };
              break;
            }
            // A mid-edge bar moves its own edge; the box keeps its shape, so it
            // grows or shrinks about the middle of the opposite edge.
            case 'r': {
              const w = start.w + dx;
              const hh = w / aspect;
              next = { x: start.x, y: start.y + (start.h - hh) / 2, w, h: hh };
              break;
            }
            case 'l': {
              const w = start.w - dx;
              const hh = w / aspect;
              next = { x: start.x + dx, y: start.y + (start.h - hh) / 2, w, h: hh };
              break;
            }
            case 'b': {
              const hh = start.h + dy;
              const w = hh * aspect;
              next = { x: start.x + (start.w - w) / 2, y: start.y, w, h: hh };
              break;
            }
            case 't': {
              const hh = start.h - dy;
              const w = hh * aspect;
              next = { x: start.x + (start.w - w) / 2, y: bottom - hh, w, h: hh };
              break;
            }
            default:
              return;
          }
          setCrop(clampCropRect(next, bounds, aspect));
        },
        onPanResponderRelease: () => {
          handleRef.current = 'none';
          setDragging(false);
        },
        onPanResponderTerminate: () => {
          handleRef.current = 'none';
          setDragging(false);
        },
      }),
    [imgRect, aspect],
  );

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainer((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    if (width > 0 && height > 0) setGuide((prev) => prev ?? documentCropGuide(documentAspect, width / height));
  };

  const confirm = async () => {
    if (!natural || !imgRect || !crop || processing) return;
    setProcessing(true);
    try {
      const scaleX = natural.w / imgRect.w;
      const scaleY = natural.h / imgRect.h;
      const originX = Math.min(Math.max((crop.x - imgRect.x) * scaleX, 0), natural.w - 1);
      const originY = Math.min(Math.max((crop.y - imgRect.y) * scaleY, 0), natural.h - 1);
      const width = Math.min(crop.w * scaleX, natural.w - originX);
      const height = Math.min(crop.h * scaleY, natural.h - originY);
      const out = await cropImage(shownUri, { originX, originY, width, height });
      // An upright box is turned back to landscape, as an upright capture is.
      const stored = guide?.turned ? await rotateImage(out, undoDegrees(null)).catch(() => out) : out;
      onConfirm(stored);
    } catch {
      setProcessing(false);
    }
  };

  const rotateDisabled = !crop || processing || rotating;
  const confirmDisabled = !crop || rotating || processing;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <StatusBar barStyle="light-content" />
      <View style={styles.screen}>
        {/* Top bar: close, the title, and an empty slot that keeps the title centred. */}
        <View style={[styles.topBar, { marginTop: insets.top + TOP_BAR_OFFSET }]}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [styles.glassRound, styles.close, { backgroundColor: pressed ? IMMERSIVE_GLASS.pressed : IMMERSIVE_GLASS.fill }]}
          >
            <Icon name="close" size={20} color={IMMERSIVE_GLASS.text} />
          </Pressable>
          <UiText
            variant="bodyMedium"
            color={IMMERSIVE_GLASS.text}
            numberOfLines={1}
            accessibilityRole="header"
            style={styles.title}
          >
            {cropperTitle(documentLabel)}
          </UiText>
          <View style={styles.close} />
        </View>

        {/* Image + crop overlay */}
        <View style={styles.stage} onLayout={onContainerLayout}>
          {!natural ? (
            <View style={[StyleSheet.absoluteFill, styles.centre]}>
              <Spinner color="#FFFFFF" />
            </View>
          ) : (
            <>
              {imgRect ? (
                <Image
                  source={{ uri: shownUri }}
                  resizeMode="contain"
                  // Hidden under the turning copy until the turned file has loaded here.
                  onLoad={() => {
                    if (swapPending.current) endTurn();
                  }}
                  style={{
                    position: 'absolute',
                    left: imgRect.x,
                    top: imgRect.y,
                    width: imgRect.w,
                    height: imgRect.h,
                    opacity: turning?.ready ? 0 : 1,
                  }}
                />
              ) : null}
              {turning ? (
                <Animated.Image
                  source={{ uri: turning.uri }}
                  resizeMode="contain"
                  onLoad={startSpin}
                  style={{
                    position: 'absolute',
                    left: turning.rect.x,
                    top: turning.rect.y,
                    width: turning.rect.w,
                    height: turning.rect.h,
                    transform: [
                      { rotate: turnAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
                      { scale: turnAnim.interpolate({ inputRange: [0, 1], outputRange: [1, turning.scale] }) },
                    ],
                  }}
                />
              ) : null}
              {container && crop ? (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: frameOpacity }]}>
                  <Svg style={StyleSheet.absoluteFill} width={container.w} height={container.h}>
                    {/* Dim surround (4 rects) */}
                    <Rect x={0} y={0} width={container.w} height={crop.y} fill={DIM} />
                    <Rect x={0} y={crop.y + crop.h} width={container.w} height={Math.max(0, container.h - crop.y - crop.h)} fill={DIM} />
                    <Rect x={0} y={crop.y} width={crop.x} height={crop.h} fill={DIM} />
                    <Rect x={crop.x + crop.w} y={crop.y} width={Math.max(0, container.w - crop.x - crop.w)} height={crop.h} fill={DIM} />
                  </Svg>

                  {/* Rule-of-thirds grid, only while dragging */}
                  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: gridOpacity }]}>
                    <Svg width={container.w} height={container.h}>
                      {gridLines(crop).map((l, i) => (
                        <Line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke={GRID} strokeWidth={StyleSheet.hairlineWidth} />
                      ))}
                    </Svg>
                  </Animated.View>

                  <Svg style={StyleSheet.absoluteFill} width={container.w} height={container.h}>
                    {/* White border */}
                    <Rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke="#FFFFFF" strokeWidth={1.5} />

                    {/* L-shaped corner handles, on the corners */}
                    {cornerPaths(crop).map((d, i) => (
                      <Path key={i} d={d} fill="none" stroke="#FFFFFF" strokeWidth={HANDLE_THICKNESS} strokeLinecap="square" strokeLinejoin="miter" />
                    ))}

                    {/* Mid-edge bars: across the edge they sit on */}
                    {edgeBars(crop).map((b, i) => (
                      <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={HANDLE_THICKNESS / 2} fill="#FFFFFF" />
                    ))}
                  </Svg>
                </Animated.View>
              ) : null}
              {/* Gesture layer on top */}
              <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
            </>
          )}
        </View>

        <UiText variant="bodySmall" color={HELP} style={styles.help}>
          {HELP_TEXT}
        </UiText>

        {/* Bottom bar: Rotate as a round glass button, then the primary action. */}
        <View style={[styles.bottomBar, { marginBottom: insets.bottom + BOTTOM_OFFSET }]}>
          <View style={styles.rotateSlot}>
            <Pressable
              onPress={rotate}
              disabled={rotateDisabled}
              accessibilityRole="button"
              accessibilityLabel={t('uploadDocument.crop.rotate')}
              accessibilityHint={ROTATE_HINT}
              accessibilityState={{ disabled: rotateDisabled, busy: rotating }}
              style={({ pressed }) => [
                styles.glassRound,
                styles.rotate,
                {
                  backgroundColor: pressed ? IMMERSIVE_GLASS.pressed : IMMERSIVE_GLASS.fill,
                  opacity: rotateDisabled && !rotating ? 0.5 : 1,
                },
              ]}
            >
              {/* The photo turning is the feedback; no spinner over the icon. */}
              <Icon name="refresh" size={22} color={IMMERSIVE_GLASS.text} />
            </Pressable>
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.caption}>
              <UiText variant="bodySmall" color={IMMERSIVE_GLASS.caption} numberOfLines={1} style={styles.captionText}>
                {t('uploadDocument.crop.rotate')}
              </UiText>
            </View>
          </View>

          <Pressable
            onPress={confirm}
            disabled={confirmDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('uploadDocument.crop.confirm')}
            accessibilityState={{ disabled: confirmDisabled, busy: processing }}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: colors.primary,
                opacity: confirmDisabled && !processing ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {processing ? (
              <Spinner color={colors.onPrimary} size="small" />
            ) : (
              <UiText variant="label" color={colors.onPrimary} numberOfLines={1} style={styles.primaryText}>
                {t('uploadDocument.crop.confirm')}
              </UiText>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The four L brackets, each drawn through its corner point. */
function cornerPaths(c: Rectangle): string[] {
  const r = c.x + c.w;
  const b = c.y + c.h;
  return [
    `M ${c.x} ${c.y + ARM} L ${c.x} ${c.y} L ${c.x + ARM} ${c.y}`,
    `M ${r - ARM} ${c.y} L ${r} ${c.y} L ${r} ${c.y + ARM}`,
    `M ${c.x} ${b - ARM} L ${c.x} ${b} L ${c.x + ARM} ${b}`,
    `M ${r - ARM} ${b} L ${r} ${b} L ${r} ${b - ARM}`,
  ];
}

/** A 20 × 4 bar centred on each edge, lying along it. */
function edgeBars(c: Rectangle): Rectangle[] {
  const half = HANDLE_THICKNESS / 2;
  const midX = c.x + c.w / 2;
  const midY = c.y + c.h / 2;
  return [
    { x: midX - EDGE_BAR / 2, y: c.y - half, w: EDGE_BAR, h: HANDLE_THICKNESS },
    { x: midX - EDGE_BAR / 2, y: c.y + c.h - half, w: EDGE_BAR, h: HANDLE_THICKNESS },
    { x: c.x - half, y: midY - EDGE_BAR / 2, w: HANDLE_THICKNESS, h: EDGE_BAR },
    { x: c.x + c.w - half, y: midY - EDGE_BAR / 2, w: HANDLE_THICKNESS, h: EDGE_BAR },
  ];
}

function gridLines(c: Rectangle): Array<[number, number, number, number]> {
  const r = c.x + c.w;
  const b = c.y + c.h;
  return [
    [c.x + c.w / 3, c.y, c.x + c.w / 3, b],
    [c.x + (c.w * 2) / 3, c.y, c.x + (c.w * 2) / 3, b],
    [c.x, c.y + c.h / 3, r, c.y + c.h / 3],
    [c.x, c.y + (c.h * 2) / 3, r, c.y + (c.h * 2) / 3],
  ];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CROPPER_STAGE,
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOP_BAR_GAP,
    paddingHorizontal: SIDE_MARGIN,
  },
  glassRound: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: IMMERSIVE_GLASS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: TOP_BAR_HEIGHT,
    height: TOP_BAR_HEIGHT,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  stage: {
    flex: 1,
  },
  centre: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  help: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: SIDE_MARGIN,
    marginBottom: GUIDE_GAP_ABOVE_CONTROLS,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: SIDE_MARGIN,
    // The caption hangs below the round button; the row reserves its space.
    paddingBottom: CAPTION_GAP + CAPTION_LINE_HEIGHT,
  },
  rotateSlot: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
  },
  rotate: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
  },
  caption: {
    position: 'absolute',
    top: SIDE_BUTTON_SIZE + CAPTION_GAP,
    left: -SIDE_BUTTON_SIZE,
    right: -SIDE_BUTTON_SIZE,
    alignItems: 'center',
  },
  captionText: {
    fontSize: 12,
    lineHeight: CAPTION_LINE_HEIGHT,
    fontWeight: '500',
  },
  primary: {
    flex: 1,
    height: SIDE_BUTTON_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
