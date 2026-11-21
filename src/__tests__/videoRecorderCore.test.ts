import { readFileSync } from 'fs';
import { join } from 'path';

import { createVideoRecorder, type RecorderLike, type RecorderSource } from '../components/videoRecorderCore';
import { recordsDocumentClip } from '../components/viewfinder/documentClip';
import { MIN_RECORDED_MS, recordingShortBy } from '../lib/documentRecordings';

// The back of a document must be recorded as the back.
//
// One camera stays open from the front to the back when the back follows with
// nothing tapped, so both sides' clips come from one recorder. iOS hands over a
// finished file through a callback once it has written it, and stop() waits
// only so long for it. A front file that arrived after that wait used to land
// in the recorder's shared state and answer the BACK's wait, so the back was
// submitted with the front's recording.

/** A fake VisionCamera output whose recorders finish when the test says so. */
function fakeOutput() {
  const takes: { file: string; finish: () => void; started: boolean }[] = [];
  const source: RecorderSource = {
    createRecorder: async () => {
      const file = `/tmp/clip-${takes.length + 1}.mp4`;
      let onFinished: (path: string) => void = () => undefined;
      const take = { file, finish: () => onFinished(file), started: false };
      takes.push(take);
      const recorder: RecorderLike = {
        startRecording: async (finished) => {
          onFinished = finished;
          take.started = true;
        },
        stopRecording: async () => undefined,
      };
      return recorder;
    },
  };
  return { source, takes };
}

describe('each take keeps its own file', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a front file that arrives late never becomes the back recording', async () => {
    const { source, takes } = fakeOutput();
    const recorder = createVideoRecorder(() => source, () => true, { maxDurationMs: 12_000, finishWaitMs: 2000 });

    recorder.start(); // the front
    await jest.advanceTimersByTimeAsync(0);
    const frontStop = recorder.stop();
    await jest.advanceTimersByTimeAsync(2000); // the front's file is slow
    await expect(frontStop).resolves.toBeNull();

    recorder.start(); // the back, same camera
    await jest.advanceTimersByTimeAsync(0);
    takes[0]!.finish(); // the front's file arrives now

    const backStop = recorder.stop();
    takes[1]!.finish();
    await jest.advanceTimersByTimeAsync(0);
    await expect(backStop).resolves.toBe('file:///tmp/clip-2.mp4');
  });

  it('answers the take it was asked about when the file is on time', async () => {
    const { source, takes } = fakeOutput();
    const recorder = createVideoRecorder(() => source, () => true, { maxDurationMs: 12_000 });
    recorder.start();
    await jest.advanceTimersByTimeAsync(0);
    const stopped = recorder.stop();
    takes[0]!.finish();
    await expect(stopped).resolves.toBe('file:///tmp/clip-1.mp4');
    expect(recorder.failure()).toBeNull();
  });

  it('still stops by itself at the length cap', async () => {
    const { source, takes } = fakeOutput();
    const stops: number[] = [];
    const capped: RecorderSource = {
      createRecorder: async (s) => {
        const r = await source.createRecorder(s);
        return {
          ...r,
          stopRecording: async () => {
            stops.push(Date.now());
          },
        };
      },
    };
    const recorder = createVideoRecorder(() => capped, () => true, { maxDurationMs: 12_000 });
    recorder.start();
    await jest.advanceTimersByTimeAsync(11_999);
    expect(stops).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(stops).toHaveLength(1);
    takes[0]!.finish();
    await expect(recorder.stop()).resolves.toBe('file:///tmp/clip-1.mp4');
  });
});

describe('the back clip starts once the document is turned over', () => {
  it('records while the side camera is live, except during the turn-over wait', () => {
    expect(recordsDocumentClip({ active: true, ready: true, waitingForTurn: false })).toBe(true);
    expect(recordsDocumentClip({ active: true, ready: true, waitingForTurn: true })).toBe(false);
    expect(recordsDocumentClip({ active: false, ready: true, waitingForTurn: false })).toBe(false);
    expect(recordsDocumentClip({ active: true, ready: false, waitingForTurn: false })).toBe(false);
  });

  it('is what the viewfinder starts its recorder on', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'CameraViewfinder.tsx'), 'utf8');
    expect(src).toContain('recordsDocumentClip({ active, ready, waitingForTurn: turnedOver && turning && !recordingLeadIn })');
    expect(src).toMatch(/if \(!recordingClip\) return undefined;\s*recorder\.start\(\);/);
    expect(src).toContain('}, [recordingClip, side]);');
  });

  it('is waiting from the first render of the back, not an effect later', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'viewfinder', 'TurnOverPrompt.tsx'), 'utf8');
    expect(src).toMatch(/if \(needed !== lastNeeded\) \{\s*setLastNeeded\(needed\);\s*setTurning\(needed\);/);
  });
});

// The server reads a side's recording twice a second and needs three readings.
// A back photographed about a second after its clip began was "not checked" on
// 4 of 11 two-sided captures (2026-11-21).
describe('a recording long enough to be checked', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks for more than a second of recording, enough for three readings', () => {
    expect(MIN_RECORDED_MS).toBeGreaterThanOrEqual(2000);
    expect(recordingShortBy({ live: true, startedAt: 1000 }, 1000)).toBe(MIN_RECORDED_MS);
    expect(recordingShortBy({ live: true, startedAt: 1000 }, 1000 + MIN_RECORDED_MS - 300)).toBe(300);
    expect(recordingShortBy({ live: true, startedAt: 1000 }, 1000 + MIN_RECORDED_MS)).toBe(0);
  });

  it('holds the whole length while the recorder is still starting', () => {
    expect(recordingShortBy({ live: true, startedAt: null }, 5000)).toBe(MIN_RECORDED_MS);
  });

  it('keeps nobody waiting where nothing is recording', () => {
    expect(recordingShortBy({ live: false, startedAt: null }, 5000)).toBe(0);
    expect(recordingShortBy({ live: false, startedAt: 1000 }, 1100)).toBe(0);
  });

  it('the recorder says when its take began to record, and stops saying so once it is stopped', async () => {
    const { source, takes } = fakeOutput();
    const recorder = createVideoRecorder(() => source, () => true, { maxDurationMs: 30_000 });
    expect(recorder.progress()).toEqual({ live: false, startedAt: null });

    jest.setSystemTime(10_000);
    recorder.start();
    expect(recorder.progress()).toEqual({ live: true, startedAt: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(recorder.progress()).toEqual({ live: true, startedAt: 10_000 });
    expect(recordingShortBy(recorder.progress(), 10_000 + MIN_RECORDED_MS)).toBe(0);

    const stopped = recorder.stop();
    takes[0]!.finish();
    await stopped;
    expect(recorder.progress().live).toBe(false);
  });

  it('a take ended by its length cap is not one to wait for', async () => {
    const { source } = fakeOutput();
    const recorder = createVideoRecorder(() => source, () => true, { maxDurationMs: 5_000 });
    recorder.start();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(recorder.progress().live).toBe(false);
  });

  it('starts the back clip that long before the turn-over wait ends, not at its start', () => {
    // Read from the source: the file draws with React Native, which this test does not load.
    const hold = readFileSync(join(__dirname, '..', 'components', 'viewfinder', 'TurnOverPrompt.tsx'), 'utf8');
    const turnOverMs = Number(/export const TURN_OVER_MS = (\d+);/.exec(hold)?.[1]);
    expect(turnOverMs - MIN_RECORDED_MS).toBeGreaterThan(2000);
    expect(hold).toContain('setTimeout(() => setRecordingLeadIn(true), Math.max(0, TURN_OVER_MS - MIN_RECORDED_MS))');
  });

  it('holds the automatic photo and the shutter in the viewfinder', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'CameraViewfinder.tsx'), 'utf8');
    expect(src).toContain('holdFire: !recordedEnough,');
    expect(src).toContain('const short = recordingShortBy(recorder.progress(), Date.now());');
    const auto = readFileSync(join(__dirname, '..', 'capture', 'useAutoCapture.ts'), 'utf8');
    expect(auto).toContain("if (verdict.framing === 'ready' && !firedRef.current && !o.holdFire) {");
  });
});

describe('the recording cap leaves room for a whole liveness run', () => {
  // A real iPhone run (2026-11-19): three head directions ended at 12.6 s, past
  // the old 12 s cap. Four directions with their prompts take about 3.5 s each;
  // the flash and the pause before the selfie come after.
  it('outlasts four head directions, the flash and the selfie pause, with room to spare', async () => {
    const { MAX_VIDEO_DURATION_MS } = await import('../config/captureSettings');
    const directions = 4 * 3_500;
    const flashAndSelfie = 8_000;
    expect(MAX_VIDEO_DURATION_MS).toBeGreaterThanOrEqual(directions + flashAndSelfie + 3_000);
  });
});
