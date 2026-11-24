// ---------------------------------------------------------------------------
// Embedded face re-authentication and enrolment with a scoped publishable key
// (user token design rev 4, section 6a and 14). A scoped key may mount the
// biometric-authentication or biometric-enrollment scope only with a biometric
// user token for the same user, minted by the host's backend. Each mount
// spends one use, so the SDK fetches a fresh token per flow start, keeps it in
// memory for that flow only and never persists it.
//
// The SDK cannot tell a scoped key from a legacy one, so the rule is: with a
// provider, fetch and send (a legacy key ignores the header); with no
// provider, every request is byte-identical to 4.4.0.
//
//   - A face-scope config: a token before /session/start.
//   - A workflow mount (the scope is the server's to know): on 403
//     `user_token_required` with a provider, one fetch and one retry. The one
//     exception to "never retry user_token_required" (section 14).
//   - /verify answering 403 `user_token_invalid` (the bound token was revoked,
//     or expired over an hour ago): a fresh token, /session/start again (a
//     resume, which rebinds), and one resubmission. 429 `too_many_attempts`
//     goes to the host, never retried.
// ---------------------------------------------------------------------------

import { configScope, isFaceScope, type WorkflowScope } from '../lib/scope';
import {
  USER_TOKEN_HEADER,
  UserTokenError,
  devWarnOnce,
  userTokenFor,
  userTokenHeaders,
  userTokenProvider,
  userTokenRefusal,
  type UserTokenProvider,
  type UserTokenRefusal,
} from '../presence/user-token';
import { VerificationApiError } from './api';

export interface MountTokenConfig {
  apiKey: string;
  scope?: WorkflowScope | string;
  getUserToken?: UserTokenProvider;
}

const hasProvider = (config: MountTokenConfig) => Boolean(config.getUserToken ?? userTokenProvider());

/** The user-token refusal an API error carries, from its code only. */
export function refusalOf(err: unknown): UserTokenRefusal | null {
  return err instanceof VerificationApiError ? userTokenRefusal(err.body ?? null) : null;
}

/**
 * The headers a mount sends: a fresh biometric token when one is due, else
 * none. Throws UserTokenError('user_token_mismatch') when the provider's
 * answer is for someone else: nothing is sent then.
 */
export async function mountTokenHeaders(
  config: MountTokenConfig,
  externalUserId: string | undefined,
  options: { anyScope?: boolean } = {},
): Promise<Record<string, string>> {
  if (!externalUserId || !hasProvider(config)) return {};
  if (!options.anyScope && !isFaceScope(configScope(config))) return {};
  const got = await userTokenFor(
    { apiKey: config.apiKey, externalUserId, purpose: 'biometric', getUserToken: config.getUserToken },
    { force: true },
  );
  if (got.mismatch) throw new UserTokenError('user_token_mismatch');
  return userTokenHeaders(got.token);
}

/**
 * Runs one /session/start with the mount's token. A workflow mount that the
 * server says needs one gets one fetch and one retry, with a provider.
 */
export async function startWithMountToken<T>(
  config: MountTokenConfig,
  externalUserId: string | undefined,
  start: (headers: Record<string, string>) => Promise<T>,
  // A re-mount after /verify's user_token_invalid: the server has said this
  // session needs a token, whatever the config's scope.
  options: { anyScope?: boolean } = {},
): Promise<T> {
  const headers = await mountTokenHeaders(config, externalUserId, options);
  try {
    return await start(headers);
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal === 'user_token_required' && !headers[USER_TOKEN_HEADER] && hasProvider(config)) {
      const retry = await mountTokenHeaders(config, externalUserId, { anyScope: true });
      if (retry[USER_TOKEN_HEADER]) return start(retry);
    }
    if (refusal) devWarnOnce(refusal);
    throw err;
  }
}

/** Whether a /verify failure is one a re-mount with a fresh token can fix. */
export function remountFixes(config: MountTokenConfig, externalUserId: string | undefined, err: unknown): boolean {
  return refusalOf(err) === 'user_token_invalid' && Boolean(externalUserId) && hasProvider(config);
}
