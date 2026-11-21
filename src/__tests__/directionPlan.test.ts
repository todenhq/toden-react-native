import { readFileSync } from 'fs';
import { join } from 'path';

import { planChallenges, planRequestFor } from '../liveness/challengeManager';
import { DIRECTION_PLAN_WAIT_MS, DirectionPlanner, parseDirectionPlan, planGate } from '../liveness/directionPlan';
import { flashSequenceNamed } from '../liveness/flashDetector';
import { buildLivenessIntegrity } from '../liveness/integritySignals';
import { createVerificationApi } from '../services/api';

// ─── Core picks the gestures (POST /liveness/directions) ─────────────────────
//
// The web SDK's liveness/direction-plan.test.ts, with the attempt bookkeeping
// the web keeps in its hook's refs tested through DirectionPlanner.

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');
const plan = { planId: 'cm3plan0001', directions: ['lookUp', 'turnLeft', 'lookDown'] as const };

describe('the head directions Core picked', () => {
  it('takes a plan with an id and 2 to 4 distinct directions that include a turn', () => {
    expect(parseDirectionPlan(plan)).toEqual({ planId: 'cm3plan0001', prompts: ['lookUp', 'turnLeft', 'lookDown'], flash: [] });
    // A Core with classic plans names the list `prompts` too.
    expect(
      parseDirectionPlan({ planId: 'cm3plan0001', prompts: ['turnRight', 'lookUp'], directions: ['turnRight', 'lookUp'] })?.prompts,
    ).toEqual(['turnRight', 'lookUp']);
  });

  it('refuses anything else, so a bad answer leaves the SDK to pick its own', () => {
    for (const raw of [
      null,
      'cm3plan0001',
      { planId: 'cm3plan0001', directions: ['lookUp', 'lookDown'] }, // no turn
      { planId: 'cm3plan0001', directions: ['turnLeft'] }, // one
      { planId: 'cm3plan0001', directions: ['turnLeft', 'turnRight', 'lookUp', 'lookDown', 'turnLeft'] }, // five
      { planId: 'cm3plan0001', directions: ['turnLeft', 'turnLeft'] }, // repeated
      { planId: 'cm3plan0001', directions: ['turnLeft', 'nod'] }, // not a direction
      { planId: 'x', directions: ['turnLeft', 'lookUp'] }, // no id
      { directions: ['turnLeft', 'lookUp'] },
    ]) {
      expect(parseDirectionPlan(raw)).toBeNull();
    }
  });

  it('holds the first instruction while the plan is on its way, and no longer than a moment', () => {
    expect(DIRECTION_PLAN_WAIT_MS).toBe(2500);
    expect(planGate({ status: 'pending', askedAt: 1000 }, 1000 + DIRECTION_PLAN_WAIT_MS - 1)).toBe('wait');
    expect(planGate({ status: 'pending', askedAt: 1000 }, 1000 + DIRECTION_PLAN_WAIT_MS)).toBe('go');
    expect(planGate({ status: 'ready', askedAt: 1000 }, 1001)).toBe('go');
    expect(planGate({ status: 'failed', askedAt: 1000 }, 1001)).toBe('go');
    expect(planGate({ status: 'none', askedAt: 0 }, 1)).toBe('go');
  });
});

describe('the classic gestures Core picked', () => {
  const classic = { set: 'classic' as const, count: 2 };

  it('takes 1 to 3 distinct classic gestures, from the pool when the integration narrowed it', () => {
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['smile', 'turn'] }, classic)).toEqual({
      planId: 'cm3plan0002',
      prompts: ['smile', 'turn'],
      flash: [],
    });
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['blink'] }, { ...classic, pool: ['blink'] })?.prompts).toEqual(['blink']);
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['smile', 'turn'] }, { ...classic, pool: ['turn', 'blink'] })).toBeNull();
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['turnLeft', 'lookUp'] }, classic)).toBeNull();
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['turn', 'turn'] }, classic)).toBeNull();
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['nod', 'blink', 'smile', 'turn'] }, classic)).toBeNull();
    // And a classic answer is no head-direction plan.
    expect(parseDirectionPlan({ planId: 'cm3plan0002', prompts: ['smile', 'turn'] })).toBeNull();
  });

  it('asks for exactly the classic plan, in its order, the flash staying a phase of its own', () => {
    expect(planChallenges(['smile', 'turn']).map((c) => c.type)).toEqual(['smile', 'turn']);
    expect(planChallenges(['turn', 'blink'], { mode: 'both' }).map((c) => c.type)).toEqual(['turn', 'blink']);
    expect(planChallenges(['blink'], { timeoutPerChallenge: 5 })[0]?.timeoutSeconds).toBe(5);
  });
});

describe('the flash colours Core picked', () => {
  const flashOnly = { set: 'none' as const, count: 0, flash: 4 };

  it('takes a flash-only plan: no gestures, the colours asked for', () => {
    expect(parseDirectionPlan({ planId: 'cm3plan0005', prompts: [], flash: ['cyan', 'red', 'blue', 'green'] }, flashOnly)).toEqual({
      planId: 'cm3plan0005',
      prompts: [],
      flash: ['cyan', 'red', 'blue', 'green'],
    });
  });

  it('carries the colours beside the gestures in Dual Check', () => {
    const both = parseDirectionPlan(
      { planId: 'cm3plan0006', prompts: ['turnLeft', 'lookUp'], flash: ['red', 'blue', 'green', 'cyan'] },
      { set: 'directions', count: 2, flash: 4 },
    );
    expect(both?.flash).toEqual(['red', 'blue', 'green', 'cyan']);
    // Colours nobody asked for are not taken.
    expect(parseDirectionPlan({ ...plan, flash: ['red', 'blue'] })?.flash).toEqual([]);
  });

  it('refuses a plan whose colours did not come back usable, so the SDK picks its own', () => {
    for (const flash of [undefined, ['red'], ['red', 'red', 'blue', 'green'], ['red', 'orange', 'blue', 'green'], ['red', 'blue']]) {
      expect(parseDirectionPlan({ planId: 'cm3plan0007', prompts: [], flash }, flashOnly)).toBeNull();
    }
  });

  it('shows Core’s colours in its order, from the palette', () => {
    expect(flashSequenceNamed(['cyan', 'red'])!.map((c) => c.name)).toEqual(['cyan', 'red']);
    expect(flashSequenceNamed(['cyan', 'orange'])).toBeNull();
    expect(flashSequenceNamed([])).toBeNull();
  });
});

describe('what each run asks Core to plan', () => {
  it('asks on every gesture and flash run, never passive; a flash-only run asks only colours', () => {
    expect(planRequestFor({ gestureSet: 'directions' })).toEqual({ set: 'directions', count: 3 });
    expect(planRequestFor({ gestureSet: 'directions', directionCount: 4, mode: 'both' })).toEqual({ set: 'directions', count: 4, flash: 4 });
    expect(planRequestFor({ gestureSet: 'classic', challengeCount: 3, challengePool: ['blink', 'turn'] })).toEqual({
      set: 'classic',
      count: 3,
      pool: ['blink', 'turn'],
    });
    expect(planRequestFor(undefined)).toEqual({ set: 'classic', count: 2, pool: undefined });
    expect(planRequestFor({ gestureSet: 'directions', mode: 'flash' })).toEqual({ set: 'none', count: 0, flash: 4 });
    expect(planRequestFor({ mode: 'flash', flashSequenceLength: 3 })).toEqual({ set: 'none', count: 0, flash: 3 });
    expect(planRequestFor({ gestureSet: 'directions', mode: 'both', flashSequenceLength: 5 })).toEqual({ set: 'directions', count: 3, flash: 5 });
    expect(planRequestFor({ gestureSet: 'classic', mode: 'both' })).toEqual({ set: 'classic', count: 2, pool: undefined, flash: 4 });
    // As many as the SDK's own pick would show: 2 to 5, which Core accepts.
    expect(planRequestFor({ mode: 'flash', flashSequenceLength: 9 })?.flash).toBe(5);
    expect(planRequestFor({ mode: 'flash', flashSequenceLength: 1 })?.flash).toBe(2);
    expect(planRequestFor({ gestureSet: 'directions' })).not.toHaveProperty('flash');
    expect(planRequestFor({ gestureSet: 'classic', mode: 'passive' })).toBeNull();
  });
});

describe('one plan per attempt', () => {
  const parsed = parseDirectionPlan(plan)!;

  it('uses the plan that answers in time, and names it', () => {
    const planner = new DirectionPlanner();
    const attempt = planner.ask(true, 0);
    expect(planner.gate(10)).toBe('wait');
    expect(planner.settle(attempt, parsed)).toBe(parsed);
    expect(planner.gate(11)).toBe('go');
    expect(planner.directionPlanId).toBe('cm3plan0001');
  });

  it('ignores an answer for an earlier attempt', () => {
    const planner = new DirectionPlanner();
    const first = planner.ask(true, 0);
    planner.ask(true, 100);
    expect(planner.settle(first, parsed)).toBeNull();
    expect(planner.directionPlanId).toBeUndefined();
    // The current attempt is still waiting for its own.
    expect(planner.gate(200)).toBe('wait');
  });

  it('never swaps the directions once the first instruction has been given', () => {
    const planner = new DirectionPlanner();
    const attempt = planner.ask(true, 0);
    planner.start();
    expect(planner.settle(attempt, parsed)).toBeNull();
    expect(planner.directionPlanId).toBeUndefined();
  });

  it('goes on with its own pick, naming no plan, when there is no answer', () => {
    const planner = new DirectionPlanner();
    const attempt = planner.ask(true, 0);
    expect(planner.settle(attempt, null)).toBeNull();
    expect(planner.gate(1)).toBe('go');
    expect(planner.directionPlanId).toBeUndefined();
  });

  it('does not wait at all when nothing was asked', () => {
    const planner = new DirectionPlanner();
    planner.ask(false, 0);
    expect(planner.gate(1)).toBe('go');
  });

  it('forgets the last attempt’s plan on a retry', () => {
    const planner = new DirectionPlanner();
    planner.settle(planner.ask(true, 0), parsed);
    planner.ask(true, 5000);
    expect(planner.directionPlanId).toBeUndefined();
    expect(planner.startFlash()).toBeNull();
  });

  const flashPlan = { planId: 'cm3plan0005', prompts: [], flash: ['cyan', 'red', 'blue', 'green'] };

  it('hands the flash Core’s colours, the same ones again for a retry of the flash', () => {
    const planner = new DirectionPlanner();
    planner.settle(planner.ask(true, 0), flashPlan);
    expect(planner.startFlash()).toEqual(['cyan', 'red', 'blue', 'green']);
    expect(planner.startFlash()).toEqual(['cyan', 'red', 'blue', 'green']);
    expect(planner.directionPlanId).toBe('cm3plan0005');
  });

  it('names no plan that lands once the flash has begun with the SDK’s own colours', () => {
    const planner = new DirectionPlanner();
    const attempt = planner.ask(true, 0);
    expect(planner.startFlash()).toBeNull();
    expect(planner.settle(attempt, flashPlan)).toBeNull();
    expect(planner.directionPlanId).toBeUndefined();
  });

  it('gives the SDK’s own colours when the plan carried none (no flash asked)', () => {
    const planner = new DirectionPlanner();
    planner.settle(planner.ask(true, 0), parsed);
    expect(planner.startFlash()).toBeNull();
    expect(planner.directionPlanId).toBe('cm3plan0001');
  });
});

describe('the plan request', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  const answering = (body: unknown, calls: { url: string; init: RequestInit }[]) =>
    jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

  it('posts the set and count to /liveness/directions and reads the plan', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = answering(plan, calls);
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.livenessDirections({ set: 'directions', count: 3 })).resolves.toEqual(parseDirectionPlan(plan));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.example.test/api/v1/liveness/directions');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ count: 3, set: 'directions' });
  });

  it('sends the classic pool only when the integration narrowed it, and checks the answer against it', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = answering({ planId: 'cm3plan0002', set: 'classic', prompts: ['smile', 'turn'], directions: ['smile', 'turn'] }, calls);
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.livenessDirections({ set: 'classic', count: 2 })).resolves.toEqual({ planId: 'cm3plan0002', prompts: ['smile', 'turn'], flash: [] });
    await expect(api.livenessDirections({ set: 'classic', count: 2, pool: [] })).resolves.not.toBeNull();
    await expect(api.livenessDirections({ set: 'classic', count: 2, pool: ['turn', 'blink'] })).resolves.toBeNull();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ count: 2, set: 'classic' });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ count: 2, set: 'classic' });
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({ count: 2, set: 'classic', pool: ['turn', 'blink'] });
  });

  it('asks a flash-only check for colours alone, no count, and Dual Check for both', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    global.fetch = answering({ planId: 'cm3plan0005', set: 'none', prompts: [], directions: [], flash: ['cyan', 'red', 'blue', 'green'], light: [] }, calls);
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.livenessDirections({ set: 'none', count: 0, flash: 4 })).resolves.toEqual({
      planId: 'cm3plan0005',
      prompts: [],
      flash: ['cyan', 'red', 'blue', 'green'],
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ set: 'none', flash: 4 });
    global.fetch = answering({ ...plan, flash: ['red', 'blue', 'green'] }, calls);
    await expect(api.livenessDirections({ set: 'directions', count: 3, flash: 3 })).resolves.toMatchObject({ flash: ['red', 'blue', 'green'] });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ count: 3, set: 'directions', flash: 3 });
  });

  it('answers null, never throws, when Core cannot say', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const api = createVerificationApi('https://api.example.test', 'pk_test_x');
    await expect(api.livenessDirections({ set: 'directions', count: 3 })).resolves.toBeNull();
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(api.livenessDirections({ set: 'classic', count: 2 })).resolves.toBeNull();
  });
});

describe('the plan in the liveness claim', () => {
  it('names the plan with the directions it asked, and names none when the SDK picked its own', () => {
    expect(buildLivenessIntegrity('gestures', 0, null, ['turnLeft', 'lookUp'], undefined, 'cm3plan0001')).toMatchObject({
      challenges: ['turnLeft', 'lookUp'],
      directionPlanId: 'cm3plan0001',
    });
    expect(buildLivenessIntegrity('gestures', 0, null, ['turnRight', 'lookDown'], undefined, undefined)).not.toHaveProperty(
      'directionPlanId',
    );
  });
});

describe('the liveness hook and the plan', () => {
  const hook = read('liveness/useLiveness.ts');

  it('asks once per attempt: the first when the camera is up, and again on a retry or a restart', () => {
    expect(hook).toContain('const attempt = plannerRef.current.ask(asking, Date.now());');
    expect(hook).toContain('const taken = plannerRef.current.settle(attempt, plan);');
    expect(hook.match(/askPlan\(\);/g)?.length).toBe(3);
  });

  it('asks for what the run needs, and builds the run from the plan’s gestures', () => {
    expect(hook).toContain('const wanted = planRequestFor(cfg);');
    expect(hook).toContain('void request(wanted)');
    expect(hook).toContain('new ChallengeTracker(planChallenges(taken.prompts, cfg));');
    // A flash-only plan replaces no gestures.
    expect(hook).toContain("if (!taken || wanted.set === 'none') return;");
  });

  it('shows the colours Core picked, and its own only when no plan came', () => {
    expect(hook).toContain('flashColours: () => plannerRef.current.startFlash(),');
    expect(read('screens/LivenessStep.tsx')).toContain('plannedColours: () => livenessRef.current.flashColours(),');
    expect(read('screens/useFlashSequence.ts')).toContain('planned ?? generateFlashSequence(sequenceLength ?? DEFAULT_FLASH_SEQUENCE),');
  });

  it('holds the first instruction for the plan, and fixes the gestures as it is given', () => {
    expect(hook).toContain("const waiting = !ready.go || plannerRef.current.gate(now) === 'wait';");
    expect(hook).toContain('plannerRef.current.start();');
    expect(hook).toContain('directionPlanId: () => plannerRef.current.directionPlanId,');
  });
});
