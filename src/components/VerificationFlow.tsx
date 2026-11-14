import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { radius, spacing } from '../config/theme';
import { buildStepOrder } from '../config/stepOrder';
import { firstAddressCaptureStep } from '../lib/address-flow';
import { stepOrderOptions } from '../store/verificationStore';
import { VerificationError } from '../types/verification';
import { safeReportError } from '../services/errors';
import { UNSUPPORTED_SCOPE_MESSAGE, unsupportedScopeConfig } from '../lib/scope';
import type { VerificationStep, SupportedCountry } from '../types/config';
import { useEffectiveCountry, useFlowState, useVerificationConfig, useVerificationStore, useTheme } from './runtime';
import { COUNTRY_SEARCH_THRESHOLD } from '../screens/CountrySelectStep';
import { VerificationSheet } from './VerificationSheet';
import { FatalConfigError } from './flow/FatalConfigError';
import { SessionCancelled, useReportCancellation } from './flow/SessionCancelled';
import { SessionDeclined, useReportDecline } from './flow/SessionDeclined';
import { ToastProvider } from './toast';
import { UiText } from './Typography';
import { UiButton } from './UiButton';
import { Icon } from './Icon';
import { StepView } from './StepView';
import { stepHeaderMeta } from './stepHeaderMeta';
import { useText } from '../i18n/useText';
import { countrySelectOptions, idCountryOnStep, poaCountryFor } from '../store/derive';
import { contactBackHidden } from '../lib/contact-recovery';

// The step router — 1:1 with the Flutter SDK's _VerificationFlowWidget. Computes per-step
// header title/description, the 4-step indicator info, back/country, fetches the
// server config on mount, and gates the flow on fatal auth failures.

/**
 * Result of a back request handled inside the flow:
 *   'navigated' — went back a step; the caller should NOT close.
 *   'blocked'   — nowhere to go back AND close is disabled; swallow it.
 *   'close'     — at the first step with close allowed; the caller should close.
 */
export type BackResult = 'navigated' | 'blocked' | 'close';

export function VerificationFlow({
  onClose,
  backRef,
}: {
  onClose: () => void;
  /** Populated with the flow's back-aware handler so the Modal's onRequestClose
   *  (Android hardware back) can navigate a step instead of dismissing. */
  backRef?: React.MutableRefObject<(() => BackResult) | null>;
}): React.ReactElement {
  const { colors } = useTheme();
  const config = useVerificationConfig();
  const country = useEffectiveCountry();
  const store = useVerificationStore();
  const currentStep = useFlowState((s) => s.currentStep);
  const selectedIdType = useFlowState((s) => s.selectedIdType);
  const documentCapturePhase = useFlowState((s) => s.documentCapturePhase);
  const contactChallenge = useFlowState((s) => s.contactChallenge);
  const serverConfig = useFlowState((s) => s.serverConfig);
  const immersiveCapture = useFlowState((s) => s.immersiveCapture);
  const addressIntroSeen = useFlowState((s) => s.addressIntroSeen);
  // Cancelled by the organisation (lib/session-cancelled.ts): terminal.
  const cancelled = useFlowState((s) => s.cancelled);
  useReportCancellation(cancelled, config.onError);
  // Declined by the server (lib/session-declined.ts): terminal the same way.
  const declined = useFlowState((s) => s.declined);
  useReportDecline(declined, config.onError);

  const startedRef = useRef(false);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      config.onStart?.();
      // A resolved workflow already delivered the allowlist + branding, so
      // there is nothing to fetch.
      if (store.getState().serverConfig.status !== 'ready') {
        void store.getState().loadServerConfig();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A business workflow with a biometric scope is refused outright: it should
  // never arrive (publish refuses it), and it must never open a camera.
  const unsupportedScope = unsupportedScopeConfig(config);
  const isFatal = unsupportedScope || (serverConfig.status === 'error' && serverConfig.fatal);
  const fatalMessage = unsupportedScope ? UNSUPPORTED_SCOPE_MESSAGE : serverConfig.message;
  useEffect(() => {
    if (isFatal && !reportedRef.current) {
      reportedRef.current = true;
      const code = unsupportedScope
        ? 'invalid_workflow'
        : serverConfig.statusCode === 401
          ? 'invalid_api_key'
          : 'feature_disabled';
      safeReportError(config.onError, new VerificationError(code, fatalMessage ?? 'Unable to start verification.'));
    }
  }, [isFatal, unsupportedScope, serverConfig.statusCode, fatalMessage, config.onError]);

  // ── The flow's ordered steps ──────────────────────────────────────────────
  // ONE list, read by the step indicator AND by the address primer below, so
  // neither can describe a flow the user is not walking. This used to be a
  // hand-written copy of the sequence, which meant a step added to the flow
  // silently didn't count towards progress.
  //
  // The derivation is memoised rather than done inside the selector: zustand
  // compares snapshots by identity, so a selector that mints a fresh object on
  // every call re-renders forever.
  const state = useFlowState((s) => s);
  const order = useMemo(() => buildStepOrder(stepOrderOptions(state)), [state]);

  // The presence primer replaces the FIRST address step's body and carries its
  // own title, so the header blanks while it is up. Matched against the order
  // rather than a second copy of "which step comes first".
  const addressIntroPending =
    config.addressCollection?.presence?.enabled === true &&
    !addressIntroSeen &&
    firstAddressCaptureStep(order) === currentStep;

  const t = useText();
  const countryOnStep = idCountryOnStep(state);
  const poaCountry = poaCountryFor(state);
  const meta = useMemo(
    () =>
      stepHeaderMeta(currentStep, {
        config,
        country,
        selectedIdType,
        documentCapturePhase,
        contactChallenge,
        addressIntroPending,
        addressEntranceFraming: state.addressEntranceFraming,
        poaDocumentType: state.poaDocumentType,
        poaCountry,
        idCountryOnStep: countryOnStep,
        multiIdSlots: state.multiIdSlots,
        t,
      }),
    [currentStep, config, country, selectedIdType, documentCapturePhase, contactChallenge, addressIntroPending,
      state.addressEntranceFraming, state.poaDocumentType, poaCountry, countryOnStep, state.multiIdSlots, t],
  );

  // ── Step indicator info ───────────────────────────────────────────────────
  // 'submitted' is excluded on purpose — it is the terminal screen, not a step
  // to make progress towards, and the indicator is hidden there.
  const stepInfo = useMemo(() => {
    if (currentStep === 'submitted') return null;
    const steps = order.filter((s) => s !== 'submitted');
    const idx = steps.indexOf(currentStep);
    if (idx < 0) return null;
    return { progress: (idx + 1) / steps.length, stepCount: steps.length };
  }, [currentStep, order]);

  // The flag beside the title names the country whose IDs are on screen. The
  // document steps ask for a country's document just as directly as the ID
  // ones do, so they carry the same flag rather than a second treatment.
  // On the combined layout the ID-type step's own country row names it, so
  // the header does not repeat it there.
  const headerCountry =
    (currentStep === 'id-type' && !countryOnStep) ||
    currentStep === 'id-input' ||
    currentStep === 'document-capture' ||
    currentStep === 'nfc'
      ? country
      : null;
  // Back is hidden on the flow's OPENING step (consent, or the first real step
  // when the workflow switched the consent screen off), not on consent by
  // name. A multi-ID run returns to the ID picker for its next check, where
  // Back means "redo the previous one", so a committed slot keeps it.
  const onOpeningStep = currentStep === order[0] && state.multiIdSlots.length === 0;
  // A contact step recovering from a refused submission returns to the end,
  // so it has no Back (lib/contact-recovery.ts); nor does hardware back leave.
  const recoveringContact = contactBackHidden(currentStep, state.contact.expired);
  const onBack =
    onOpeningStep || currentStep === 'submitted' || recoveringContact ? null : () => store.getState().previousStep();

  // Android hardware back arrives via the <Modal>'s onRequestClose. Expose a
  // back-aware handler through `backRef` so that handler navigates a step back
  // when the flow can, instead of dismissing the whole SDK. It only reports
  // 'close' from the opening step with close allowed; with
  // `disableClose` set it reports 'blocked' so back can never force the flow
  // closed. (iOS has no hardware back; its swipe-down keeps the standard
  // dismiss behaviour, handled by the Modal.)
  const canGoBack = !isFatal && !cancelled && !declined && onBack != null;
  const disableClose = config.disableClose === true;
  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = (): BackResult => {
      if (canGoBack) {
        store.getState().previousStep();
        return 'navigated';
      }
      return disableClose || recoveringContact ? 'blocked' : 'close';
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, canGoBack, disableClose, recoveringContact, store]);

  if (isFatal) {
    return <FatalConfigError message={fatalMessage} onClose={onClose} />;
  }
  if (cancelled) return <SessionCancelled message={cancelled.message} onClose={onClose} />;
  if (declined) return <SessionDeclined declined={declined} onClose={onClose} />;

  return (
    <ToastProvider>
      <VerificationSheet
        title={meta.title}
        description={meta.description}
        progress={stepInfo?.progress ?? null}
        stepCount={stepInfo?.stepCount ?? null}
        country={headerCountry}
        onBack={onBack}
        onClose={onClose}
        // The searchable country picker (>5 countries) pins its search box
        // above a ~240-row list; the address pin and entrance steps fill it
        // too, since a map or panorama owns every touch and their actions
        // ride StickyActions at the bottom of a BOUNDED body.
        fillsViewport={
          (currentStep === 'country-select' &&
            countrySelectOptions({ config, serverConfig }).length > COUNTRY_SEARCH_THRESHOLD) ||
          currentStep === 'address-collection' ||
          currentStep === 'address-entrance'
        }
        // A live camera asks for the whole screen (a camera you have to scroll
        // to is a broken camera). Passed as a PROP rather than rendered as its
        // own tree: an early-returned tree changed the step's parent MID-STEP,
        // so React remounted it and wiped the acknowledged primer. Scoped to
        // the step as well as the flag so the next step cannot inherit it.
        //
        // The liveness camera takes it the same way, but keeps the flow's
        // colours and has the sheet draw its back and close.
        immersive={
          immersiveCapture &&
          (currentStep === 'document-capture' || currentStep === 'liveness')
        }
        immersiveControls={currentStep === 'liveness'}
      >
        <StepView step={currentStep} onClose={onClose} />
      </VerificationSheet>
    </ToastProvider>
  );
}
