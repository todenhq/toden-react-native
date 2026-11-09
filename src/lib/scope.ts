// Workflow SCOPE — what a flow verifies about the subject (mirror of the
// server's lib/workflows/scope.ts and the web SDK's lib/scope.ts; keep the
// three in lockstep). Absent = the full verification.

export type WorkflowScope =
  | 'address'
  | 'biometric-authentication'
  | 'biometric-enrollment'
  | 'questionnaire'
  | 'contact';

/** The marker idType a scoped submission carries (the KYB product-in-idType
 *  convention — the server requires the matching published workflow). */
export const SCOPE_ID_TYPES: Record<WorkflowScope, string> = {
  address: 'address',
  'biometric-authentication': 'biometric-auth',
  'biometric-enrollment': 'biometric-enroll',
  questionnaire: 'questionnaire',
  contact: 'contact',
};

export function configScope(config: { scope?: WorkflowScope | string }): WorkflowScope | null {
  const value = config.scope;
  return value && value in SCOPE_ID_TYPES ? (value as WorkflowScope) : null;
}

/** The biometric scopes run the liveness capture; every other scope has no
 *  camera step at all. */
export function isFaceScope(scope: WorkflowScope | null): boolean {
  return scope === 'biometric-authentication' || scope === 'biometric-enrollment';
}

/**
 * Scopes a BUSINESS workflow may carry: the address of its premises, a
 * questionnaire about the company, or its contact details. The biometric
 * scopes take a person's face and never apply to a business (the server
 * refuses them at publish). Mirrors the web SDK's lib/scope.ts.
 */
export const BUSINESS_SCOPES: ReadonlySet<WorkflowScope> = new Set<WorkflowScope>([
  'address',
  'questionnaire',
  'contact',
]);

interface SubjectFacts {
  subjectType?: string | null;
  scope?: WorkflowScope | string | null;
}

/** Whether the workflow verifies something about a business (wording only). */
export function isBusinessSubject(config: { subjectType?: string | null }): boolean {
  return config.subjectType === 'business';
}

/**
 * A scoped business workflow: the scope's own steps, worded for a business.
 * Never the KYB application flow (config/business.ts isBusinessFlow).
 */
export function isScopedBusiness(config: SubjectFacts): boolean {
  const scope = configScope({ scope: config.scope ?? undefined });
  return isBusinessSubject(config) && scope !== null && BUSINESS_SCOPES.has(scope);
}

/**
 * A configuration the SDK refuses to run: a business workflow carrying a
 * biometric scope. It should never arrive (publish refuses it); if it does,
 * the flow shows the configuration error and never opens a camera.
 */
export function unsupportedScopeConfig(config: SubjectFacts): boolean {
  const scope = configScope({ scope: config.scope ?? undefined });
  return isBusinessSubject(config) && scope !== null && !BUSINESS_SCOPES.has(scope);
}

/** What the configuration-error screen says for {@link unsupportedScopeConfig}. */
export const UNSUPPORTED_SCOPE_MESSAGE =
  'This verification is set up as a face check for a business, which is not supported. Contact the organisation that sent it.';
