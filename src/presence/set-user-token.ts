// ---------------------------------------------------------------------------
// setUserToken: the host hands the SDK a presence token it already has, most
// often from a silent push, so a phone that has not been opened for days can
// send what its background queue holds. The body is the mint response; it is
// checked exactly as a provider's answer is (user-token.ts), kept for the
// background (secure-token.ts), and the queue is flushed at once.
// ---------------------------------------------------------------------------

import { loadFenceUser, loadReporterConfig, loadServiceUser } from './background-store';
import { flushPendingObservations } from './flush';
import { acceptUserToken, type UserTokenResponse } from './user-token';
import './secure-token';

/**
 * Throws UserTokenError('user_token_mismatch') when the token is not for the
 * user background presence runs for (or `externalUserId`, when given), or is
 * not a presence token for this key's environment, or has expired.
 */
export async function setUserToken(
  body: UserTokenResponse,
  options: { externalUserId?: string } = {},
): Promise<void> {
  const user = options.externalUserId ?? loadFenceUser() ?? loadServiceUser();
  const apiKey = user ? (loadReporterConfig(user)?.apiKey ?? null) : null;
  const accepted = await acceptUserToken(body, { externalUserId: user, apiKey });
  if (accepted.purpose === 'presence') await flushPendingObservations(accepted.externalUserId, accepted.token);
}
