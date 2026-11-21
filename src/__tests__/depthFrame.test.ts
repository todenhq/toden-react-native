import type { CameraPhotoOutput, CapturePhotoSettings } from 'react-native-vision-camera';

import {
  capturePhotoWithDepth,
  depthFrameOf,
  depthSelfieCamera,
  enablePhotoDepth,
  setDepthFrameNativeForTests,
} from '../liveness/depthFrame';
import type { MyazaDepthFrame } from '../specs/MyazaDepthFrame.nitro';

function fakeNative(overrides: Partial<MyazaDepthFrame> = {}): MyazaDepthFrame {
  return {
    enablePhotoDepth: () => true,
    photoDepthReady: () => true,
    depthPngFromPhoto: async () => '/tmp/toden-depth-1.png',
    ...overrides,
  } as unknown as MyazaDepthFrame;
}

function fakeOutput(capture: (settings: CapturePhotoSettings) => Promise<{ filePath: string }>) {
  const asked: CapturePhotoSettings[] = [];
  const output = {
    capturePhotoToFile: (settings: CapturePhotoSettings) => {
      asked.push(settings);
      return capture(settings);
    },
  } as unknown as CameraPhotoOutput;
  return { output, asked };
}

afterEach(() => setDepthFrameNativeForTests(null));

describe('depthSelfieCamera', () => {
  const wide = { position: 'front', type: 'wide-angle' };
  const faceId = { position: 'front', type: 'true-depth' };
  const back = { position: 'back', type: 'wide-angle' };

  it('picks the Face ID camera on an iPhone that has one', () => {
    expect(depthSelfieCamera([back, wide, faceId], 'ios')).toBe(faceId);
  });

  it('leaves the usual front camera to the caller without one, and off iOS', () => {
    expect(depthSelfieCamera([back, wide], 'ios')).toBeUndefined();
    expect(depthSelfieCamera([wide, faceId], 'android')).toBeUndefined();
  });
});

describe('capturePhotoWithDepth', () => {
  const plain = { flashMode: 'off' as const };

  it('asks for depth only once the output is ready for it', async () => {
    setDepthFrameNativeForTests(fakeNative());
    const { output, asked } = fakeOutput(async () => ({ filePath: '/p.heic' }));
    expect(await capturePhotoWithDepth(output, plain)).toEqual({ filePath: '/p.heic' });
    expect(asked).toEqual([{ flashMode: 'off', enableDepthData: true }]);
  });

  it('never asks for depth when the output is not ready, which would crash', async () => {
    setDepthFrameNativeForTests(fakeNative({ photoDepthReady: () => false }));
    const { output, asked } = fakeOutput(async () => ({ filePath: '/p.heic' }));
    await capturePhotoWithDepth(output, plain);
    expect(asked).toEqual([plain]);
  });

  it('takes the still without depth where there is no native module', async () => {
    const { output, asked } = fakeOutput(async () => ({ filePath: '/p.heic' }));
    await capturePhotoWithDepth(output, plain);
    expect(asked).toEqual([plain]);
  });

  it('takes the still again without depth when the depth capture fails', async () => {
    setDepthFrameNativeForTests(fakeNative());
    const { output, asked } = fakeOutput(async (s) => {
      if (s.enableDepthData) throw new Error('depth unsupported');
      return { filePath: '/p.heic' };
    });
    expect(await capturePhotoWithDepth(output, plain)).toEqual({ filePath: '/p.heic' });
    expect(asked).toEqual([{ flashMode: 'off', enableDepthData: true }, plain]);
  });
});

describe('enablePhotoDepth', () => {
  const output = {} as CameraPhotoOutput;

  it('answers what the native side did, and false without it', () => {
    expect(enablePhotoDepth(output)).toBe(false);
    setDepthFrameNativeForTests(fakeNative());
    expect(enablePhotoDepth(output)).toBe(true);
  });

  it('never throws', () => {
    setDepthFrameNativeForTests(
      fakeNative({
        enablePhotoDepth: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(enablePhotoDepth(output)).toBe(false);
  });
});

describe('depthFrameOf', () => {
  it('gives the PNG as a file:// URI', async () => {
    setDepthFrameNativeForTests(fakeNative());
    expect(await depthFrameOf('file:///p.heic')).toBe('file:///tmp/toden-depth-1.png');
    setDepthFrameNativeForTests(fakeNative({ depthPngFromPhoto: async () => 'file:///tmp/d.png' }));
    expect(await depthFrameOf('file:///p.heic')).toBe('file:///tmp/d.png');
  });

  it('is null for a photo without depth, a failure, or no native module', async () => {
    expect(await depthFrameOf('file:///p.heic')).toBeNull();
    setDepthFrameNativeForTests(fakeNative({ depthPngFromPhoto: async () => '' }));
    expect(await depthFrameOf('file:///p.heic')).toBeNull();
    setDepthFrameNativeForTests(
      fakeNative({
        depthPngFromPhoto: async () => {
          throw new Error('unreadable');
        },
      }),
    );
    expect(await depthFrameOf('file:///p.heic')).toBeNull();
  });

  it('gives up within its bound', async () => {
    setDepthFrameNativeForTests(fakeNative({ depthPngFromPhoto: () => new Promise<string>(() => {}) }));
    expect(await depthFrameOf('file:///p.heic', 20)).toBeNull();
  });
});
