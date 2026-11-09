import { useCallback, useRef, useState } from 'react';
import { useMicrophonePermission } from 'react-native-vision-camera';

import { askForMicrophone, microphoneDeclared } from '../../services/device-intel/microphone';

// The microphone for a workflow that records sound on the document clip.
//
// Asked for after the camera, and before the viewfinder mounts: the video
// output is configured with audio once, when it is created. Best-effort
// throughout: a refused or undeclared microphone gives a silent clip.

export interface DocumentMicrophone {
  /** The answer is in, either way. */
  settled: boolean;
  /** The clip may record sound. */
  granted: boolean;
  /** Fire the OS prompt, once, when the moment comes. */
  ask: () => void;
}

export function useDocumentMicrophone(): DocumentMicrophone {
  const { hasPermission, requestPermission } = useMicrophonePermission();
  const [answer, setAnswer] = useState<boolean | null>(null);
  const askedRef = useRef(false);

  const ask = useCallback(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    void askForMicrophone({ hasPermission, declared: microphoneDeclared, request: requestPermission }).then(setAnswer);
  }, [hasPermission, requestPermission]);

  return { settled: answer !== null, granted: answer === true, ask };
}
