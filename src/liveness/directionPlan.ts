// ---------------------------------------------------------------------------
// The gestures Core picked for one liveness attempt (kyc-core
// docbio/direction-plan.ts): the head directions, since 2026-11-18 the
// classic gestures too, and since 2026-11-19 the flash colours. Pure.
//
// A client that picks its own order could be modified to choose it. So each
// attempt asks Core for a plan (POST /liveness/directions), asks for exactly
// those gestures in that order, and names the plan in its liveness claim
// (`directionPlanId`), which Core checks at the verification. Without a plan
// (an older Core, or no answer in time) the SDK picks as before and names
// none, which Core records.
//
// The web SDK's liveness/direction-plan.ts, with the attempt bookkeeping its
// useLiveness keeps in refs gathered into DirectionPlanner, so it can be
// tested without a camera.
// ---------------------------------------------------------------------------

import { FLASH_PALETTE, MAX_FLASH_SEQUENCE, MIN_FLASH_SEQUENCE } from './flashDetector';
import { DIRECTION_CHALLENGES, type LivenessChallenge } from './types';

/** The classic gestures Core may plan. */
const CLASSIC: readonly LivenessChallenge[] = ['nod', 'turn', 'blink', 'smile'];

/** What one attempt asks Core for. */
export interface PlanRequest {
  /** Which gestures: head directions, classic, or none (a flash-only check). */
  set: 'directions' | 'classic' | 'none';
  /** Head directions 2 to 4; classic 2 or 3; not sent for none. */
  count: number;
  /** Classic only: the gestures the integration allows, when it narrowed them. */
  pool?: readonly LivenessChallenge[];
  /** How many flash colours to show (2 to 5), when the check runs a flash: Core picks them. */
  flash?: number;
}

export interface DirectionPlan {
  planId: string;
  /** The gestures to ask, in order; empty for a flash-only check. */
  prompts: LivenessChallenge[];
  /** The flash colours to show, in order; empty when none was asked (or an older Core). */
  flash: string[];
}

/** The colour names every SDK and Core share: the palette's. */
const FLASH_NAMES: readonly string[] = FLASH_PALETTE.map((c) => c.name);

/** The flash colours of an answer: 2 to 5 distinct known names, or none. */
function flashOf(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < MIN_FLASH_SEQUENCE || raw.length > MAX_FLASH_SEQUENCE) return [];
  if (!raw.every((c) => typeof c === 'string' && FLASH_NAMES.includes(c)) || new Set(raw).size !== raw.length) return [];
  return raw as string[];
}

/** How long the first instruction waits for the plan before the SDK picks its own. */
export const DIRECTION_PLAN_WAIT_MS = 2500;

const TURNS: readonly string[] = ['turnLeft', 'turnRight'];

/**
 * A plan from Core the SDK can use for what it asked, or null. Head
 * directions: 2 to 4 distinct, a turn among them. Classic: 1 to 3 distinct
 * classic gestures, all from the pool when one was given. Reads `prompts`,
 * else `directions` (a Core from before classic plans). When colours were
 * asked, exactly that many distinct palette colours must come back: a plan
 * without them is no plan, since naming it while showing the SDK's own
 * colours would read at Core as a flash that does not match its plan.
 */
export function parseDirectionPlan(raw: unknown, request: PlanRequest = { set: 'directions', count: 3 }): DirectionPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const { planId, prompts, directions, flash: flashRaw } = raw as {
    planId?: unknown;
    prompts?: unknown;
    directions?: unknown;
    flash?: unknown;
  };
  const list = Array.isArray(prompts) ? prompts : directions;
  if (typeof planId !== 'string' || !/^[a-z0-9]{8,40}$/i.test(planId)) return null;
  const flash = request.flash != null ? flashOf(flashRaw) : [];
  if (request.flash != null && flash.length !== request.flash) return null;
  if (request.set === 'none') return { planId, prompts: [], flash };
  if (!Array.isArray(list) || new Set(list).size !== list.length) return null;
  if (request.set === 'classic') {
    const allowed = request.pool && request.pool.length > 0 ? request.pool : CLASSIC;
    if (list.length < 1 || list.length > 3) return null;
    if (!list.every((g) => CLASSIC.includes(g as LivenessChallenge) && allowed.includes(g as LivenessChallenge))) return null;
    return { planId, prompts: list as LivenessChallenge[], flash };
  }
  if (list.length < 2 || list.length > DIRECTION_CHALLENGES.length) return null;
  if (!list.every((d) => (DIRECTION_CHALLENGES as readonly unknown[]).includes(d))) return null;
  if (!list.some((d) => TURNS.includes(d as string))) return null;
  return { planId, prompts: list as LivenessChallenge[], flash };
}

export type PlanStatus = 'none' | 'pending' | 'ready' | 'failed';

/** What the first instruction does about the plan: wait for it, or go on without it. */
export function planGate(plan: { status: PlanStatus; askedAt: number }, now: number): 'wait' | 'go' {
  return plan.status === 'pending' && now - plan.askedAt < DIRECTION_PLAN_WAIT_MS ? 'wait' : 'go';
}

/**
 * One plan request per attempt. `ask` starts an attempt and returns its
 * number; the answer is taken (`settle` returns the plan) only while it is
 * still that attempt and the first instruction has not been given (`start`).
 * An answer for an earlier attempt, or one that comes after asking has begun,
 * is ignored: the gestures never change once the person is following them.
 * The flash beginning (`startFlash`) fixes the attempt the same way, which is
 * what matters for a flash-only check: it gives no first instruction, so a
 * plan landing mid-flash would otherwise be named for colours it never showed.
 */
export class DirectionPlanner {
  private attempt = 0;
  private started = false;
  private plan: { status: PlanStatus; askedAt: number } = { status: 'none', askedAt: 0 };
  private planId: string | undefined;
  private flash: string[] = [];

  /** A new attempt that asks for a plan (`asking`), or one that will not. */
  ask(asking: boolean, now: number): number {
    this.attempt += 1;
    this.started = false;
    this.planId = undefined;
    this.flash = [];
    this.plan = asking ? { status: 'pending', askedAt: now } : { status: 'none', askedAt: 0 };
    return this.attempt;
  }

  /** The answer for `attempt`: the plan to use, or null to keep the SDK's own pick. */
  settle(attempt: number, plan: DirectionPlan | null): DirectionPlan | null {
    if (attempt !== this.attempt) return null;
    if (!plan || this.started) {
      this.plan = { status: 'failed', askedAt: this.plan.askedAt };
      return null;
    }
    this.plan = { status: 'ready', askedAt: this.plan.askedAt };
    this.planId = plan.planId;
    this.flash = plan.flash;
    return plan;
  }

  /** Whether the first instruction may be given now, or should wait a moment for the plan. */
  gate(now: number): 'wait' | 'go' {
    return planGate(this.plan, now);
  }

  /** The first instruction has been given: the gestures are fixed from here. */
  start(): void {
    this.started = true;
  }

  /**
   * The flash is beginning: the colours Core picked for this attempt, or null
   * for the SDK's own (no plan in time, or none asked). Fixes the attempt, so
   * a later answer is refused and no plan is named. A retry of the flash
   * within the attempt gets the same colours: the claim must carry the plan's.
   */
  startFlash(): string[] | null {
    this.started = true;
    return this.flash.length > 0 ? [...this.flash] : null;
  }

  /** The plan this attempt asks, for the liveness claim; undefined when the SDK picked its own. */
  get directionPlanId(): string | undefined {
    return this.planId;
  }
}
