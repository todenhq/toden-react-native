// The iPhone report behind this: "it showed me the prompt to change to always
// allow and at the same time moved to the success screen and opened settings".
// expo-location answered "denied" with the prompt still up, and the signal
// that a prompt had appeared had not reached JavaScript yet.

type Listener = (state: string) => void;
let listeners: Listener[] = [];
const appState = {
  currentState: 'active',
  addEventListener: (_: string, listener: Listener) => {
    listeners.push(listener);
    return { remove: () => { listeners = listeners.filter((l) => l !== listener); } };
  },
};
const mockOS = { OS: 'ios' };
jest.mock('react-native', () => ({ AppState: appState, Platform: mockOS }), { virtual: true });

import { PROMPT_SETTLE_MS, PROMPT_WAIT_MS, withPromptWatch } from '../presence/os-prompt';

const emit = (state: string) => {
  appState.currentState = state;
  [...listeners].forEach((l) => l(state));
};
const denied = { status: 'denied' };
const granted = { status: 'granted' };

describe('withPromptWatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    listeners = [];
    appState.currentState = 'active';
    mockOS.OS = 'ios';
  });
  afterEach(() => jest.useRealTimers());

  it('waits out a denial that arrives with the prompt still up, and reads the real answer', async () => {
    const read = jest.fn().mockResolvedValue(granted);
    let done: { result: typeof denied; prompted: boolean } | null = null;
    void withPromptWatch(async () => denied, read).then((r) => { done = r; });
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toBeNull();

    emit('inactive');
    await jest.advanceTimersByTimeAsync(10000);
    expect(done).toBeNull();

    emit('active');
    await jest.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    expect(done).toEqual({ result: granted, prompted: true });
  });

  it('takes "Keep Only While Using" as an answer, not as silence', async () => {
    const read = jest.fn().mockResolvedValue(denied);
    const watch = withPromptWatch(async () => denied, read);
    await jest.advanceTimersByTimeAsync(100);
    emit('inactive');
    await jest.advanceTimersByTimeAsync(3000);
    emit('active');
    await jest.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    await expect(watch).resolves.toEqual({ result: denied, prompted: true });
  });

  it('reports no prompt only after iOS had its full chance to show one', async () => {
    const read = jest.fn();
    let done: unknown = null;
    void withPromptWatch(async () => denied, read).then((r) => { done = r; });
    await jest.advanceTimersByTimeAsync(PROMPT_WAIT_MS - 100);
    expect(done).toBeNull();
    await jest.advanceTimersByTimeAsync(100);
    expect(done).toEqual({ result: denied, prompted: false });
    expect(read).not.toHaveBeenCalled();
  });

  it('counts a prompt that goes up after the denial, inside the wait', async () => {
    const read = jest.fn().mockResolvedValue(granted);
    const watch = withPromptWatch(async () => denied, read);
    await jest.advanceTimersByTimeAsync(2000);
    emit('inactive');
    emit('active');
    await jest.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    await expect(watch).resolves.toEqual({ result: granted, prompted: true });
  });

  it('does not wait when the answer is already yes', async () => {
    const read = jest.fn();
    await expect(withPromptWatch(async () => granted, read)).resolves.toEqual({ result: granted, prompted: true });
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps the timing rule on Android, whose answer can be trusted', async () => {
    mockOS.OS = 'android';
    await expect(withPromptWatch(async () => denied, jest.fn())).resolves.toEqual({ result: denied, prompted: false });
  });

  it('leaves no listener behind', async () => {
    const watch = withPromptWatch(async () => denied, jest.fn());
    await jest.advanceTimersByTimeAsync(PROMPT_WAIT_MS);
    await watch;
    expect(listeners).toHaveLength(0);
  });
});
