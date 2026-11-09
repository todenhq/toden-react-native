import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// The flow's own close (the sheet header's X), for a screen inside a step that
// covers the header, such as the full-screen photo camera.
//
// StepView provides it, set to null when the host passed `disableClose`, so a
// screen that reads it shows no close button exactly when the header shows
// none.
// ---------------------------------------------------------------------------

export const FlowCloseContext = createContext<(() => void) | null>(null);

/** Close the whole flow, or null when closing is turned off. */
export function useFlowClose(): (() => void) | null {
  return useContext(FlowCloseContext);
}
