// ---------------------------------------------------------------------------
// Challenge manager — randomly picks 2–3 challenges and tracks progress.
// Port of the web SDK's `challenge-manager.ts`, adapted to the RN/Flutter
// `ChallengeConfig` shape.
// ---------------------------------------------------------------------------

import {
  CHALLENGE_POOL,
  DEFAULT_LIVENESS_CONFIG,
  DIRECTION_POOL,
  HOLD_CHALLENGE,
  type ChallengeConfig,
  type LivenessChallenge,
  type LivenessConfig,
  type LivenessMode,
} from './types';
import type { PlanRequest } from './directionPlan';
import { flashSequenceCount } from './flashDetector';

// Gestures within a similarity group should never appear together — one can
// accidentally satisfy the other (head motion overlaps).
const SIMILARITY_GROUPS: LivenessChallenge[][] = [['nod', 'turn']];

function areSimilar(a: LivenessChallenge, b: LivenessChallenge): boolean {
  return SIMILARITY_GROUPS.some((group) => group.includes(a) && group.includes(b));
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Whether the workflow's liveness mode runs gesture challenges at all.
 *
 * `flash` means the screen-reflection sequence IS the check, so gestures are
 * skipped entirely — only `both` runs gestures and then flash. `passive`
 * counts as running prompts: its single hold rides the same challenge
 * machinery. Kept in step with the Flutter SDK's `runsGestures` and the web SDK.
 */
export function modeRunsGestures(mode: LivenessMode | undefined): boolean {
  return mode !== 'flash';
}

/** A run asks for this many directions unless the workflow says otherwise. */
export const DEFAULT_DIRECTION_COUNT = 3;

/**
 * What this configuration asks Core to plan for an attempt, or null when it
 * runs neither gestures nor a flash (passive). Every gesture run asks: head
 * directions with the `directions` set, otherwise the classic gestures with
 * the integration's count and pool, so a modified client cannot choose
 * either. Since 2026-11-19 Core picks the flash colours too: every run with a
 * flash asks for them, and a flash-only run asks for no gestures, only
 * colours. The web SDK's useLiveness, in one pure place.
 */
export function planRequestFor(config: Partial<LivenessConfig> | undefined): PlanRequest | null {
  const mode = config?.mode ?? 'gestures';
  const asksGestures = mode === 'gestures' || mode === 'both';
  const showsFlash = mode === 'flash' || mode === 'both';
  if (!asksGestures && !showsFlash) return null;
  // As many colours as the SDK's own pick would show, so either way the same length.
  const flash = showsFlash ? { flash: flashSequenceCount(config?.flashSequenceLength) } : {};
  if (!asksGestures) return { set: 'none', count: 0, ...flash };
  return config?.gestureSet === 'directions'
    ? { set: 'directions', count: config.directionCount ?? DEFAULT_DIRECTION_COUNT, ...flash }
    : { set: 'classic', count: config?.challengeCount ?? 2, pool: config?.challengePool, ...flash };
}

/**
 * PURE given `random`. The directions of a run, `count` of the four (2 to 4,
 * anything else is 3), always with at least one head turn, left or right. A
 * turn is what tells a head from a flat picture: Core's head-movement check
 * only calls a capture flat when a turn was asked for, and a photo can be
 * tilted up and down but not turned. The rest are picked at random from the
 * other three, so which directions and their order are what a recording made
 * earlier cannot know. Returned in the pool's order; the caller shuffles. The
 * web SDK's challenge-manager.ts, number for number.
 */
export function pickDirections(count: number = DEFAULT_DIRECTION_COUNT, random: () => number = Math.random): ChallengeConfig[] {
  const n = Number.isInteger(count) && count >= 2 && count <= DIRECTION_POOL.length ? count : DEFAULT_DIRECTION_COUNT;
  const turns = DIRECTION_POOL.filter((c) => c.type === 'turnLeft' || c.type === 'turnRight');
  const turn = turns[Math.floor(random() * turns.length) % turns.length]!;
  const rest = DIRECTION_POOL.filter((c) => c !== turn);
  // A partial Fisher-Yates with the same random source: n - 1 of the other three.
  for (let i = 0; i < n - 1; i++) {
    const j = i + (Math.floor(random() * (rest.length - i)) % (rest.length - i));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  const chosen = new Set([turn, ...rest.slice(0, n - 1)]);
  return DIRECTION_POOL.filter((c) => chosen.has(c));
}

/**
 * The challenges for a plan Core picked (liveness/directionPlan.ts): its
 * gestures (head directions or classic) in its order. The flash is not a
 * tracker entry in this SDK (it is a phase of its own, added to the claim by
 * livenessPrompts), so unlike web nothing is appended for Dual Check.
 */
export function planChallenges(prompts: readonly string[], config: Partial<LivenessConfig> = {}): ChallengeConfig[] {
  const merged = { ...DEFAULT_LIVENESS_CONFIG, ...config };
  return prompts
    .map((type) => DIRECTION_POOL.find((c) => c.type === type) ?? CHALLENGE_POOL.find((c) => c.type === type))
    .filter((c): c is ChallengeConfig => !!c)
    .map((c) => ({ ...c, timeoutSeconds: merged.timeoutPerChallenge }));
}

/**
 * Picks `challengeCount` non-similar challenges from the pool, in random order.
 *
 * Returns NOTHING in flash-only mode. This is gated here, at the single place
 * challenges are chosen, rather than at the call sites: `useLiveness` rebuilds
 * the tracker in three separate places (mount, retry, face-change reset), and a
 * check in one of them would leave the others silently running gestures a
 * flash-only workflow explicitly turned off.
 *
 * Deliberately keyed on the mode rather than `challengeCount: 0` — the count is
 * clamped to at least one on purpose, so that a stray zero in a consumer's
 * config can never quietly disable gesture liveness. Skipping gestures has to
 * be asked for.
 */
export function pickChallenges(config: Partial<LivenessConfig> = {}): ChallengeConfig[] {
  const merged = { ...DEFAULT_LIVENESS_CONFIG, ...config };
  if (!modeRunsGestures(merged.mode)) return [];
  // Passive: no gestures and no flash. Hold still while the clip records.
  if (merged.mode === 'passive') return [{ ...HOLD_CHALLENGE }];

  // Head directions: as many as the workflow asks for, 2 to 4, 3 unless set,
  // in a shuffled order. This pick stands in until Core's plan for the
  // attempt arrives (useLiveness), and is used when none does.
  if (merged.gestureSet === 'directions') {
    return shuffle(pickDirections(merged.directionCount)).map((c) => ({ ...c, timeoutSeconds: merged.timeoutPerChallenge }));
  }

  let pool = CHALLENGE_POOL;
  if (merged.challengePool && merged.challengePool.length > 0) {
    const allowed = new Set<LivenessChallenge>(merged.challengePool);
    pool = CHALLENGE_POOL.filter((c) => allowed.has(c.type));
  }

  const count = Math.min(merged.challengeCount, pool.length);
  const shuffled = shuffle(pool);

  // A head TURN is always one of the prompts (wherever it falls in the random
  // order), because the server's shape-from-movement test needs one: a turn
  // swings the nose across the face, which a flat picture cannot do. The rest
  // stay random. Matches the web SDK's challenge-manager.
  const picked: ChallengeConfig[] = [];
  const turn = shuffled.find((c) => c.type === 'turn');
  if (turn && count > 0) picked.push({ ...turn, timeoutSeconds: merged.timeoutPerChallenge });

  // Greedily pick challenges that aren't similar to already-picked ones.
  for (const candidate of shuffled) {
    if (picked.length >= count) break;
    const duplicate = picked.some((p) => p.type === candidate.type);
    if (!duplicate && !picked.some((p) => areSimilar(p.type, candidate.type))) {
      picked.push({ ...candidate, timeoutSeconds: merged.timeoutPerChallenge });
    }
  }

  // Fallback: if similarity rules were too strict, fill remaining slots.
  if (picked.length < count) {
    for (const candidate of shuffled) {
      if (picked.length >= count) break;
      if (!picked.some((p) => p.type === candidate.type)) {
        picked.push({ ...candidate, timeoutSeconds: merged.timeoutPerChallenge });
      }
    }
  }

  // The turn went first to guarantee it; shuffle so its position stays random.
  return shuffle(picked);
}

/**
 * The prompts a run asks for, in order: what the liveness claim reports as
 * `challenges`. The flash is a phase of its own here rather than a tracker
 * entry, so it is added from the mode: last in `both` (it runs after the
 * gestures), alone in `flash`, and FIRST when a flash-only check fell back to
 * gestures (the fallback ran after it).
 */
export function livenessPrompts(
  mode: LivenessMode | undefined,
  challengeTypes: readonly LivenessChallenge[],
  fellBack = false,
): string[] {
  if (fellBack) return ['flash', ...challengeTypes];
  if (mode === 'flash') return ['flash'];
  if (mode === 'both') return [...challengeTypes, 'flash'];
  return [...challengeTypes];
}

/** Gesture challenges to run when a flash-only check could not be measured. */
export function pickFallbackGestures(config: Partial<LivenessConfig> = {}): ChallengeConfig[] {
  return pickChallenges({ ...config, mode: 'gestures' });
}

// ---------------------------------------------------------------------------
// Progress tracker
// ---------------------------------------------------------------------------

export type ChallengeProgress = 'pending' | 'active' | 'passed' | 'failed';

export interface ChallengeEntry {
  config: ChallengeConfig;
  progress: ChallengeProgress;
}

export class ChallengeTracker {
  private entries: ChallengeEntry[];
  private _currentIndex: number;

  constructor(challenges: ChallengeConfig[]) {
    this.entries = challenges.map((config, i) => ({
      config,
      progress: i === 0 ? 'active' : 'pending',
    }));
    this._currentIndex = 0;
  }

  get current(): ChallengeEntry | null {
    return this.entries[this._currentIndex] ?? null;
  }

  get currentIndex(): number {
    return this._currentIndex;
  }

  get all(): readonly ChallengeEntry[] {
    return this.entries;
  }

  get isComplete(): boolean {
    return this.entries.every((e) => e.progress === 'passed');
  }

  get totalCount(): number {
    return this.entries.length;
  }

  /** Add challenges after the current ones (the gesture fallback for a flash). */
  append(challenges: ChallengeConfig[]): void {
    const wasDone = this._currentIndex >= this.entries.length;
    for (const config of challenges) this.entries.push({ config, progress: 'pending' });
    const first = this.entries[this._currentIndex];
    if (wasDone && first) first.progress = 'active';
  }

  markCurrentPassed(): void {
    const entry = this.entries[this._currentIndex];
    if (entry) entry.progress = 'passed';
  }

  markCurrentFailed(): void {
    const entry = this.entries[this._currentIndex];
    if (entry) entry.progress = 'failed';
  }

  /** Advances to the next challenge; returns true if more remain. */
  advance(): boolean {
    this._currentIndex++;
    const next = this.entries[this._currentIndex];
    if (next) {
      next.progress = 'active';
      return true;
    }
    return false;
  }
}
