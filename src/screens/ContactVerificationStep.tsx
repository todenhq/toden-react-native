import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { View } from 'react-native';

import { spacing } from '../config/theme';
import { useEffectiveCountry, useFlowState, useVerificationConfig, useVerificationStore } from '../components/runtime';
import { ContactActions } from './ContactActions';
import { ContactEntryPanel } from './ContactEntryPanel';
import { ContactVerifiedPanel } from './ContactVerifiedPanel';
import { ContactCodeStep } from './ContactCodeStep';
import {
  contactCodeLength,
  contactIsRequired,
  isValidContactEmail,
  offeredPhoneChannels,
  sentCodeLength,
  type PhoneOtpChannel,
} from '../config/contact';
import { describeSendError } from '../services/contactErrors';
import { stepAfterContactVerified } from '../lib/contact-recovery';
import { INITIAL_CODE_ENTRY, codeEntryReducer } from '../lib/contact-code-state';
import { declinedRefusalOf } from '../lib/session-declined';

// ---------------------------------------------------------------------------
// Contact-verification OTP step — email or phone, one component, two mounts.
//
//   enter destination → send → code entry → verified → continue
//
// The proof token is single-use and rides the /verify submission. The server
// enforces whether it was required; the `required: false` skip here is UX, and
// a skipped optional check simply submits without the proof.
// ---------------------------------------------------------------------------

export function ContactVerificationStep({
  channel,
}: {
  channel: 'email' | 'phone';
}): React.ReactElement {
  const config = useVerificationConfig();
  const country = useEffectiveCountry();
  const store = useVerificationStore();
  const contact = useFlowState((s) => s.contact);
  const serverConfig = useFlowState((s) => s.serverConfig);
  const sessionId = useFlowState((s) => s.sessionId);

  const isEmail = channel === 'email';
  const stepConfig = isEmail ? config.emailVerification : config.phoneVerification;
  const required = contactIsRequired(stepConfig);
  const configuredLength = contactCodeLength(stepConfig);
  // What the server actually sent, which its pinned workflow decides.
  const [sentLength, setSentLength] = useState<number | null>(null);
  const codeLength = sentLength ?? configuredLength;
  const inputStyle = stepConfig?.inputStyle ?? 'segmented';
  // Letters as well as digits, when the org turned it on in the builder.
  const alphanumeric = stepConfig?.alphanumericCode === true;
  // The org decides which channels are on offer; the user picks between them.
  const offeredChannels: PhoneOtpChannel[] = isEmail
    ? []
    : offeredPhoneChannels(config.phoneVerification?.channels);
  const [via, setVia] = useState<PhoneOtpChannel>(offeredChannels[0] ?? 'sms');

  const alreadyVerified = isEmail ? contact.emailToken != null : contact.phoneToken != null;

  const [destination, setDestination] = useState(contact.emailAddress ?? '');
  // The phone field emits E.164 + validity from libphonenumber, so the step no
  // longer guesses either from raw text.
  const [phone, setPhone] = useState<{ e164: string; isValid: boolean }>(
    { e164: contact.phoneNumber ?? '', isValid: false },
  );
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  // The code, its message and whether it is used up (lib/contact-code-state).
  const [entry, dispatch] = useReducer(codeEntryReducer, INITIAL_CODE_ENTRY);
  const { code, error, attemptsLeft, usedUp } = entry;
  const setCode = useCallback((next: string) => dispatch({ type: 'typed', code: next }), []);
  const [busy, setBusy] = useState(false);
  const otherChannel = offeredChannels.find((c) => c !== via) ?? null;

  const value = isEmail ? destination.trim() : phone.e164;
  const canSend = isEmail ? isValidContactEmail(value) : phone.isValid;

  // Entered via submit recovery? (The server refused this channel's proof at
  // submit — the token had expired or was already claimed.) Captured at mount:
  // verifying clears the flag, and Continue must still route back to
  // 'submitted' afterwards (which auto-submits with the fresh proof).
  const recovery = useRef((contact.expired ?? []).includes(channel)).current;
  const advance = useCallback(() => {
    const target = stepAfterContactVerified({
      recovery,
      expired: store.getState().contact.expired ?? [],
      channel,
    });
    if (target) store.getState().goToStep(target);
    else store.getState().nextStep();
  }, [store, channel, recovery]);

  // The sheet header is rendered by the shell and cannot see this step's state,
  // so publish what it needs to caption: the channel in play now, and the
  // destination once a code is actually out. Re-published when the user picks a
  // different delivery channel so the header's "by WhatsApp" follows the choice.
  useEffect(() => {
    store.getState().setContactChallenge({
      channel,
      ...(isEmail ? {} : { via }),
      ...(challengeId ? { destination: value } : {}),
    });
  }, [store, channel, isEmail, via, challengeId, value]);

  /** `switchTo` re-sends over the other channel when the first one didn't land. */
  const send = async (switchTo?: PhoneOtpChannel): Promise<void> => {
    const sendVia = switchTo ?? via;
    if (switchTo) setVia(switchTo);
    setBusy(true);
    dispatch({ type: 'request' });
    try {
      const res = await store.getState().api.contactSend({
        channel,
        destination: value,
        codeLength: configuredLength,
        ...(sessionId ? { sessionId } : {}),
        ...(stepConfig?.maxAttempts != null ? { maxAttempts: stepConfig.maxAttempts } : {}),
        ...(!isEmail && country ? { country } : {}),
        ...(isEmail ? {} : { via: sendVia }),
      });
      // Remember what was typed BEFORE the code lands: a user who backs out
      // here and returns should not have to retype it.
      store.getState().setContactDestination(channel, value);
      setSentLength(sentCodeLength(res.codeLength, configuredLength));
      setChallengeId(res.challengeId);
      setExpiresAt(res.expiresAt ?? null);
      // A new code: clears the old one, its message and any used-up lock.
      dispatch({ type: 'sent' });
    } catch (err) {
      // Declined: the flow is already on the declined screen (the API client
      // marked it); nothing here to show.
      const declined = declinedRefusalOf(err);
      if (declined) {
        store.getState().markDeclined(declined, channel);
        return;
      }
      dispatch({ type: 'sendFailed', message: describeSendError(err) });
    } finally {
      setBusy(false);
    }
  };

  const check = async (submitted: string): Promise<void> => {
    if (!challengeId || usedUp || submitted.length !== codeLength) return;
    setBusy(true);
    dispatch({ type: 'request' });
    try {
      const res = await store.getState().api.contactCheck({
        challengeId,
        code: submitted,
        ...(sessionId ? { sessionId } : {}),
        ...(country ? { country } : {}),
      });
      store.getState().setContactVerified(channel, value, res.token);
      advance();
    } catch (err) {
      // The last attempt declined the session (`declineOnLastAttempt`): the
      // flow ends on the declined screen, named for this channel.
      const declined = declinedRefusalOf(err);
      if (declined) {
        store.getState().markDeclined(declined, channel);
        return;
      }
      dispatch({ type: 'checkFailed', err });
    } finally {
      setBusy(false);
    }
  };

  // Returning to a step already passed — nothing left to do here.
  if (alreadyVerified) {
    return (
      <ContactVerifiedPanel
        isEmail={isEmail}
        destination={isEmail ? contact.emailAddress : contact.phoneNumber}
        onContinue={advance}
      />
    );
  }

  // One frame for both halves, like web: the panel swaps, the actions stay put.
  return (
    <View>
      {challengeId ? (
        <ContactCodeStep
          // A fresh field for each code sent. On iOS a TextInput that goes
          // from editable={false} back to true can stay locked, and autoFocus
          // only runs on mount; remounting gives the new code an editable,
          // empty, focused field (as Flutter keys its field on the send).
          key={challengeId}
          codeLength={codeLength}
          inputStyle={inputStyle}
          alphanumeric={alphanumeric}
          code={code}
          busy={busy}
          usedUp={usedUp}
          error={error}
          attemptsLeft={attemptsLeft}
          expiresAt={expiresAt}
          otherChannel={otherChannel}
          onChange={setCode}
          onCheck={(full) => void check(full)}
          onResend={(switchTo) => void send(switchTo)}
        />
      ) : (
        <ContactEntryPanel
          isEmail={isEmail}
          recovery={recovery}
          email={destination}
          onEmailChange={setDestination}
          onPhoneChange={setPhone}
          defaultCountry={config.phoneVerification?.defaultCountry ?? country ?? serverConfig.geoCountry ?? undefined}
          geoCountry={serverConfig.geoCountry}
          error={error}
          disabled={busy}
          offeredChannels={offeredChannels}
          via={via}
          onPickChannel={setVia}
        />
      )}

      <ContactActions
        hasChallenge={challengeId != null}
        codeUsedUp={usedUp}
        busy={busy}
        disabled={challengeId ? !usedUp && code.length !== codeLength : !canSend}
        required={required}
        isEmail={isEmail}
        // A used-up code: the button sends a new one down the same channel.
        onPrimary={() => (challengeId && !usedUp ? void check(code) : void send())}
        onSkip={advance}
      />
    </View>
  );
}
