// The contact step's code entry, as a pure reducer (screens/ContactVerificationStep).
//
// One rule needs the state to be explicit: a used-up code. Once the server
// says the code's attempts are spent (`invalid_code` with no attempts left, or
// `too_many_attempts`), every further guess is refused, so the field is
// disabled, auto-submit and paste stop, and the primary button sends a new
// code instead. A new code that is actually sent clears it all. A failed send
// leaves the code used up: nothing changed on the server.

import {
  CODE_USED_UP_MESSAGE,
  attemptsRemaining,
  describeCheckError,
  isCodeUsedUp,
} from '../services/contactErrors';

/** The primary button's label while the code is used up. UK English. */
export const SEND_NEW_CODE_LABEL = 'Send a new code';

export interface CodeEntryState {
  code: string;
  /** The current code's attempts are spent: entry is off until a new code. */
  usedUp: boolean;
  error: string | null;
  /** Attempts left after a wrong code, when the server said. */
  attemptsLeft: number | undefined;
}

export type CodeEntryEvent =
  | { type: 'typed'; code: string }
  /** A send or a check started: the last message no longer applies. */
  | { type: 'request' }
  | { type: 'sent' }
  | { type: 'sendFailed'; message: string }
  | { type: 'checkFailed'; err: unknown };

export const INITIAL_CODE_ENTRY: CodeEntryState = {
  code: '',
  usedUp: false,
  error: null,
  attemptsLeft: undefined,
};

export function codeEntryReducer(state: CodeEntryState, event: CodeEntryEvent): CodeEntryState {
  switch (event.type) {
    case 'typed':
      // A used-up code takes no more typing (or autofill, or paste).
      return state.usedUp ? state : { ...state, code: event.code };
    case 'request':
      return { ...state, error: null, attemptsLeft: undefined };
    case 'sent':
      return INITIAL_CODE_ENTRY;
    case 'sendFailed':
      return { ...state, error: event.message, attemptsLeft: undefined };
    case 'checkFailed': {
      if (state.usedUp || isCodeUsedUp(event.err)) {
        return { code: '', usedUp: true, error: CODE_USED_UP_MESSAGE, attemptsLeft: undefined };
      }
      return {
        code: '',
        usedUp: false,
        error: describeCheckError(event.err),
        attemptsLeft: attemptsRemaining(event.err),
      };
    }
    default:
      return state;
  }
}
