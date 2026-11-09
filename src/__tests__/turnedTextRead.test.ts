// The turned read is a NEW native method. An app whose native build predates it
// must still read text upright, or auto-capture would stop for every document.

const recognizeText = jest.fn(() => ({ lines: ['UPRIGHT'] }));
let turned: jest.Mock | undefined;

jest.mock('react-native-nitro-modules', () => {
  const recognizer = {
    recognizeText: (...a: unknown[]) => recognizeText(...(a as [])),
    get recognizeTextTurned() {
      return turned;
    },
  };
  return {
    NitroModules: {
      hasHybridObject: () => true,
      createHybridObject: () => recognizer,
      box: (o: unknown) => ({ unbox: () => o }),
    },
  };
});

import { recognizeTurnedLines } from '../mrz/textRecognizer';

const frame = {} as never;

describe('recognizeTurnedLines', () => {
  it('reads with the turn the native side reports', () => {
    turned = jest.fn(() => ({ lines: ['NIMC'], quarterTurns: 3 }));
    expect(recognizeTurnedLines(frame, 0)).toEqual({ lines: ['NIMC'], quarterTurns: 3 });
    expect(turned).toHaveBeenCalledWith(frame, 0);
  });

  it('keeps a known direction', () => {
    turned = jest.fn(() => ({ lines: [], quarterTurns: 1 }));
    recognizeTurnedLines(frame, 1);
    expect(turned).toHaveBeenCalledWith(frame, 1);
  });

  it('falls back to the upright read on an older native build', () => {
    turned = undefined; // calling it throws, as a missing Nitro method does
    expect(recognizeTurnedLines(frame, 0)).toEqual({ lines: ['UPRIGHT'], quarterTurns: 0 });
    expect(recognizeText).toHaveBeenCalledWith(frame, 1);
  });
});
