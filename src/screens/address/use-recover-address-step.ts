import { useEffect } from 'react';

import { useFlowState } from '../../components/runtime';
import { isAddressStep } from '../../lib/address-flow';
import { addressExitStep, recoverAddressStep } from '../../lib/address-step-recovery';
import { buildStepOrder } from '../../config/stepOrder';
import { stepOrderOptions } from '../../store/verificationStore';
import type { VerificationStore } from '../../store/state';

// Split from use-address-flow.ts (200-line rule): putting an applicant who was
// resumed onto an address step the flow no longer has back on one it does.

export function useRecoverAddressStep(store: VerificationStore): void {
  // A resumed attempt restores the step it was saved on, and the flow may have
  // changed shape since: `searchAvailable` is a SERVER flag that lands after the
  // restore, and a republish can drop the entrance photo. Left alone the
  // applicant sits on a screen the order does not contain, where Continue has
  // nothing to advance to and Back has no predecessor. Gated on the config
  // having settled: until then the order is not the real one.
  const configSettled = useFlowState((s) => s.serverConfig.status !== 'loading');
  const currentStep = useFlowState((s) => s.currentStep);
  useEffect(() => {
    if (!configSettled || !isAddressStep(currentStep)) return;
    const options = stepOrderOptions(store.getState());
    const inFlow = buildStepOrder(options).filter(isAddressStep);
    const exit = addressExitStep(buildStepOrder({ ...options, hasAddressCollection: true }));
    const recovered = recoverAddressStep(currentStep, inFlow, exit);
    if (recovered) store.getState().goToStep(recovered);
  }, [configSettled, currentStep, store]);
}
