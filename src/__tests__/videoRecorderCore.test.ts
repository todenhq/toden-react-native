import { readFileSync } from 'fs';
import { join } from 'path';

import { createVideoRecorder, type RecorderLike, type RecorderSource } from '../components/videoRecorderCore';
import { recordsDocumentClip } from '../components/viewfinder/documentClip';

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
    expect(src).toContain('recordsDocumentClip({ active, ready, waitingForTurn: turnedOver && turning })');
    expect(src).toMatch(/if \(recordingClip\) recorder\.start\(\);/);
    expect(src).toContain('}, [recordingClip, side]);');
  });

  it('is waiting from the first render of the back, not an effect later', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'viewfinder', 'TurnOverPrompt.tsx'), 'utf8');
    expect(src).toMatch(/if \(needed !== lastNeeded\) \{\s*setLastNeeded\(needed\);\s*setTurning\(needed\);/);
  });
});
