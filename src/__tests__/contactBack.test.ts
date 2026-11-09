import { readFileSync } from 'fs';
import { join } from 'path';

import { buildStepOrder, previousStepInOrder, type StepOrderOptions } from '../config/stepOrder';
import { contactBackHidden } from '../lib/contact-recovery';

// Back on the email and phone checks. Mirrors the web SDK's
// lib/contact-back.test.ts (stepBeforeContact): phone backs into email when
// the flow has one, else consent; email backs into consent; none while
// recovering from a refused submission; none on a consent-less flow's
// opening step.

const base: StepOrderOptions = {
  isBusiness: false,
  hasDocCapture: true,
  hasNfc: false,
  hasLiveness: true,
  hasCountrySelect: false,
  hasEmailVerification: false,
  hasPhoneVerification: false,
  hasPoa: false,
  hasSupportingDocuments: false,
  hasAddressCollection: false,
  hasQuestionnaire: false,
};

describe('Back on the email and phone checks', () => {
  it('takes the email check back to consent', () => {
    expect(previousStepInOrder('email-verification', { ...base, hasEmailVerification: true })).toBe('consent');
  });

  it('takes the phone check back to the email check when the flow has one', () => {
    const o = { ...base, hasEmailVerification: true, hasPhoneVerification: true };
    expect(previousStepInOrder('phone-verification', o)).toBe('email-verification');
  });

  it('takes the phone check back to consent when there is no email check', () => {
    expect(previousStepInOrder('phone-verification', { ...base, hasPhoneVerification: true })).toBe('consent');
  });

  it('opens a consent-less flow on its first contact check, which has no Back', () => {
    const order = buildStepOrder({ ...base, hasConsent: false, hasEmailVerification: true });
    expect(order[0]).toBe('email-verification');
    const flow = readFileSync(join(__dirname, '../components/VerificationFlow.tsx'), 'utf8');
    expect(flow).toContain('const onOpeningStep = currentStep === order[0]');
  });

  it('hides Back while the step recovers from a refused submission', () => {
    expect(contactBackHidden('email-verification', ['email'])).toBe(true);
    expect(contactBackHidden('phone-verification', ['email'])).toBe(false);
    expect(contactBackHidden('phone-verification', ['phone'])).toBe(true);
    expect(contactBackHidden('email-verification', undefined)).toBe(false);
    expect(contactBackHidden('consent', ['email'])).toBe(false);
    const flow = readFileSync(join(__dirname, '../components/VerificationFlow.tsx'), 'utf8');
    expect(flow).toContain('contactBackHidden(currentStep, state.contact.expired)');
  });
});
