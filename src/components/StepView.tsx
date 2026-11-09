import React, { useEffect } from 'react';
import { View } from 'react-native';

import { useVerificationConfig, useVerificationStore } from './runtime';
import type { VerificationStep } from '../types/config';
import { ConsentStep } from '../screens/ConsentStep';
import { IdTypeStep } from '../screens/IdTypeStep';
import { IdInputStep } from '../screens/IdInputStep';
import { DocumentCaptureStep } from '../screens/DocumentCaptureStep';
import { LivenessStep } from '../screens/LivenessStep';
import { SubmittedStep } from '../screens/SubmittedStep';
import { QuestionnaireStep } from '../screens/QuestionnaireStep';
import { ContactVerificationStep } from '../screens/ContactVerificationStep';
import { SupportingDocumentsStep } from '../screens/SupportingDocumentsStep';
import { ProofOfAddressStep } from '../screens/ProofOfAddressStep';
import {
  AddressBookStep,
  SavedAddressSheet,
  AddressEntranceStep,
  AddressPinStep,
  AddressReviewStep,
  AddressSearchStep,
} from '../screens/address';
import { CountrySelectStep } from '../screens/CountrySelectStep';
import { BusinessDetailsStep } from '../screens/BusinessDetailsStep';
import { BusinessKeyPeopleStep } from '../screens/BusinessKeyPeopleStep';
import { BusinessDocumentsStep } from '../screens/BusinessDocumentsStep';
import { ApplicantRoleStep } from '../screens/ApplicantRoleStep';
import { NfcStep } from '../screens/NfcStep';
import { MultiIdProgress } from './MultiIdProgress';
import { useMultiIdPlan } from '../lib/use-multi-id-plan';
import { countryOnIdStep } from '../lib/id-selection-layout';
import { FlowCloseContext } from './flowClose';

// ---------------------------------------------------------------------------
// The step router — which screen a step renders.
//
// Split from VerificationFlow.tsx (200-line rule) so adding a step touches the router
// and the step order, and nothing else.
// ---------------------------------------------------------------------------

/** The steps a multi-ID run walks once PER ID — the ones whose screen is about
 *  one particular check and therefore needs the position strip above it. */
const MULTI_ID_STEPS: readonly VerificationStep[] = [
  'id-type',
  'id-input',
  'document-capture',
  'nfc',
  'liveness',
];

/** Wraps a step's screen with the multi-ID position strip when a run is active. */
export function StepView({ step, onClose }: { step: VerificationStep; onClose: () => void }): React.ReactElement {
  const plan = useMultiIdPlan();
  const disableClose = useVerificationConfig().disableClose === true;
  // A full-screen camera inside a step covers the header's X, so it draws its
  // own and closes through this (components/flowClose.ts).
  const screen = (
    <FlowCloseContext.Provider value={disableClose ? null : onClose}>{stepScreen(step, onClose)}</FlowCloseContext.Provider>
  );
  if (plan && MULTI_ID_STEPS.includes(step)) {
    return (
      <View style={{ flex: 1 }}>
        <MultiIdProgress plan={plan} />
        <View style={{ flex: 1 }}>{screen}</View>
      </View>
    );
  }
  return screen;
}

function stepScreen(step: VerificationStep, onClose: () => void): React.ReactElement {
  switch (step) {
    case 'consent':
      return <ConsentStep />;
    case 'id-type':
      return <IdTypeStep />;
    case 'id-input':
      return <IdInputStep />;
    case 'document-capture':
      return <DocumentCaptureStep />;
    case 'liveness':
      return <LivenessStep />;
    case 'questionnaire':
      return <QuestionnaireStep />;
    // Distinct keys are LOAD-BEARING: both mounts are the same component type
    // at the same position, so without them React reuses the instance when the
    // flow moves email → phone. The phone step would open holding the email
    // step's challengeId, show its code panel, and verifying would file the
    // EMAIL proof as the phone token — which the server then drops, blocking
    // submission on a phone check the user appears to have passed.
    case 'email-verification':
      return <ContactVerificationStep key="contact-email" channel="email" />;
    case 'phone-verification':
      return <ContactVerificationStep key="contact-phone" channel="phone" />;
    case 'proof-of-address':
      return <ProofOfAddressStep />;
    case 'supporting-documents':
      return <SupportingDocumentsStep />;
    // The address flow, in order: find it, confirm it, show it, commit it.
    // 'address-collection' is the PIN step and keeps that wire name so older
    // session progress restores cleanly.
    // A picked saved address stands in for the capture steps; the offer of
    // one is a sheet over whichever of them opens the flow.
    case 'address-book':
      return <AddressBookStep />;
    case 'address-search':
      return (
        <>
          <AddressSearchStep />
          <SavedAddressSheet />
        </>
      );
    case 'address-collection':
      return (
        <>
          <AddressPinStep />
          <SavedAddressSheet />
        </>
      );
    case 'address-entrance':
      return <AddressEntranceStep />;
    case 'address-review':
      return <AddressReviewStep />;
    case 'country-select':
      return <CountrySelectRoute />;
    case 'business-details':
      return <BusinessDetailsStep />;
    case 'business-key-people':
      return <BusinessKeyPeopleStep />;
    case 'business-documents':
      return <BusinessDocumentsStep />;
    case 'applicant-role':
      return <ApplicantRoleStep />;
    case 'nfc':
      return <NfcStep />;
    case 'submitted':
      return <SubmittedStep onClose={onClose} />;
    default:
      return <UnimplementedStep step={step} />;
  }
}

/**
 * The country step, or on the combined layout (lib/id-selection-layout.ts)
 * the ID-type step that carries the country. A combined flow reaches
 * 'country-select' only from older state (a resumed run), so it moves on to
 * 'id-type', the step the order knows, and shows that meanwhile.
 */
function CountrySelectRoute(): React.ReactElement {
  const config = useVerificationConfig();
  const store = useVerificationStore();
  const combined = countryOnIdStep(config);
  useEffect(() => {
    if (combined) store.getState().goToStep('id-type');
  }, [combined, store]);
  return combined ? <IdTypeStep /> : <CountrySelectStep />;
}

/**
 * A step that is in the order but has no screen on this platform yet.
 *
 * It advances rather than rendering something — the previous `default` fell
 * back to the consent screen, which put the user in a loop they could not leave
 * (consent's Continue leads back to the same step). Skipping degrades an
 * unbuilt step to "it didn't run", which is the same thing a workflow that left
 * it off would do, and is recoverable. Logged so it surfaces in development
 * instead of only as a step that mysteriously never appears.
 */
function UnimplementedStep({ step }: { step: VerificationStep }): React.ReactElement {
  const store = useVerificationStore();
  useEffect(() => {
    console.warn(`[myaza-kyc] No screen for step "${step}" — skipping.`);
    store.getState().nextStep();
  }, [step, store]);
  return <View />;
}
