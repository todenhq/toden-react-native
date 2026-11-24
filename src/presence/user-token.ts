// ---------------------------------------------------------------------------
// User tokens for scoped publishable keys (Toden design 0020, section 14).
//
// A scoped publishable key cannot read or write one user's presence on its
// own: the server wants a short-lived user token, minted by the customer's
// backend with a secret key, in the X-Toden-User-Token header. The SDK never
// mints one. The host gives it a provider, which asks the host's own backend;
// the provider gets NO user id, because the backend knows who is signed in.
//
// Rules this file owns, one place for every presence call:
//   - No provider: no header, and every request is byte-identical to 4.4.0.
//   - A provider's answer is checked before it is used: the user, the purpose,
//     the token's shape and environment, and its expiry. Anything else is
//     discarded, nothing is sent, and the call ends `user_token_mismatch`.
//   - A provider that fails or answers null means "no token": the request goes
//     without the header, which a legacy key does not need.
//   - 403 `user_token_invalid` with a provider: one new token, one retry.
//     `user_token_required`, `scope_not_declared` and every other answer are
//     never retried. The error CODE decides, never the status.
//   - Tokens are never logged. A presence token may be kept only in device-only
//     secure storage (secure-token.ts); a biometric token is never kept.
// Mirrors the Flutter SDK's user_token.dart; the shared cases live in
// sdk-flutter/test/user_token_vectors.json.
// ---------------------------------------------------------------------------

export const USER_TOKEN_HEADER = 'X-Toden-User-Token';

export type UserTokenPurpose = 'presence' | 'biometric';

/** What the customer's backend got back from `POST /user-tokens/{purpose}`. */
export interface UserTokenResponse {
  token: string;
  externalUserId: string;
  purpose: string;
  expiresAt: string;
  [extra: string]: unknown;
}

/** Asks the host's backend for a token for its signed-in user. Null: none. */
export type UserTokenProvider = (ctx: { purpose: UserTokenPurpose }) => Promise<UserTokenResponse | null>;

/** The server's user-token refusals, and the SDK's own `user_token_mismatch`. */
export type UserTokenRefusal = 'user_token_required' | 'user_token_invalid' | 'scope_not_declared';
export type UserTokenErrorCode = UserTokenRefusal | 'user_token_mismatch';

export class UserTokenError extends Error {
  readonly code: UserTokenErrorCode;
  constructor(code: UserTokenErrorCode) {
    super(MESSAGES[code]);
    this.name = 'UserTokenError';
    this.code = code;
  }
}

const MESSAGES: Record<UserTokenErrorCode, string> = {
  user_token_required: 'This request needs a user token from your server. Pass getUserToken to the SDK.',
  user_token_invalid: 'The user token was not accepted. Your server should issue a new one.',
  scope_not_declared: 'A publishable key limited to workflows cannot use address presence.',
  user_token_mismatch: 'The user token from your server is for another user or purpose, or has expired.',
};

const TOKEN_SHAPE = /^ut_(live|test|dev)_[A-Za-z0-9_-]{43}$/;
const KEY_ENV = /^(?:pk|sk)_(live|test|dev)_/;

export interface CheckedUserToken {
  token: string;
  externalUserId: string;
  purpose: UserTokenPurpose;
  expiresAtMs: number;
}

/**
 * PURE. The provider's answer as a token the SDK may send for this user and
 * purpose, or null when it must be discarded.
 */
export function checkUserToken(
  body: unknown,
  expect: { externalUserId: string; purpose: UserTokenPurpose; apiKey: string },
  nowMs: number,
): CheckedUserToken | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const { token, externalUserId, purpose, expiresAt } = b;
  if (typeof token !== 'string' || typeof externalUserId !== 'string') return null;
  if (typeof purpose !== 'string' || typeof expiresAt !== 'string') return null;
  if (externalUserId !== expect.externalUserId || purpose !== expect.purpose) return null;
  const shape = TOKEN_SHAPE.exec(token);
  const keyEnv = KEY_ENV.exec(expect.apiKey);
  if (!shape || !keyEnv || shape[1] !== keyEnv[1]) return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs) return null;
  return { token, externalUserId, purpose: expect.purpose, expiresAtMs };
}

/** PURE. The user-token refusal an error answer carries, from its code only. */
export function userTokenRefusal(body: unknown): UserTokenRefusal | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const error = b['error'];
  const code =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)['code']
      : typeof error === 'string'
        ? error
        : b['code'];
  return code === 'user_token_required' || code === 'user_token_invalid' || code === 'scope_not_declared'
    ? code
    : null;
}

/** The header for a token, or nothing at all, so a request without one is unchanged. */
export function userTokenHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { [USER_TOKEN_HEADER]: token } : {};
}

// ─── Provider, cache and the current user ────────────────────────────────────

interface Cached extends CheckedUserToken {
  fetchedAtMs: number;
  stale: boolean;
}

let registered: UserTokenProvider | null = null;
const cache = new Map<string, Cached>();
const warned = new Set<string>();
/** Called with every presence token the SDK accepts (secure-token.ts persists it). */
let onAccepted: ((token: CheckedUserToken) => Promise<void>) | null = null;

const cacheKey = (user: string, purpose: UserTokenPurpose) => `${purpose}\u0000${user}`;

/** The provider every presence call uses when it is not given its own. */
export function setUserTokenProvider(provider: UserTokenProvider | null): void {
  registered = provider;
}

export function userTokenProvider(): UserTokenProvider | null {
  return registered;
}

/** @internal Wiring for secure-token.ts, kept out of this file's imports. */
export function onUserTokenAccepted(listener: ((token: CheckedUserToken) => Promise<void>) | null): void {
  onAccepted = listener;
}

/** @internal Tests only. */
export function resetUserTokens(): void {
  registered = null;
  cache.clear();
  warned.clear();
  onAccepted = null;
}

/** One development warning per code, never with the token. */
export function devWarnOnce(code: UserTokenErrorCode): void {
  if (warned.has(code)) return;
  warned.add(code);
  // Never the token: only the code and what to do about it.
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[toden] ${code}: ${MESSAGES[code]}`);
}

/**
 * Forget a token the server refused, so the next call asks for a new one.
 * With `token`, only that token: a newer one accepted while the refused
 * request was out stays good.
 */
export function markUserTokenStale(externalUserId: string, purpose: UserTokenPurpose, token?: string): void {
  const hit = cache.get(cacheKey(externalUserId, purpose));
  if (hit && (token === undefined || hit.token === token)) hit.stale = true;
}

/** The cached token, while it is still good to send; never fetches. */
export function cachedUserToken(externalUserId: string, purpose: UserTokenPurpose, nowMs: number = Date.now()): CheckedUserToken | null {
  const hit = cache.get(cacheKey(externalUserId, purpose));
  return hit && !hit.stale && nowMs < hit.expiresAtMs ? hit : null;
}

/** Keep a checked token for the background again (its stored copy may be stale). */
export async function rekeepUserToken(token: CheckedUserToken): Promise<void> {
  if (token.purpose !== 'presence' || !onAccepted) return;
  try {
    await onAccepted(token);
  } catch {
    // Best-effort: the foreground flush below still has the token.
  }
}

/** Forget the user's tokens (logout, stand-down). */
export function forgetUserTokens(externalUserId: string): void {
  cache.delete(cacheKey(externalUserId, 'presence'));
  cache.delete(cacheKey(externalUserId, 'biometric'));
}

/** Past half its life, a token is renewed before it is used. */
function usable(hit: Cached | undefined, nowMs: number): hit is Cached {
  if (!hit || hit.stale) return false;
  return nowMs < hit.fetchedAtMs + (hit.expiresAtMs - hit.fetchedAtMs) / 2;
}

async function accept(checked: CheckedUserToken, nowMs: number): Promise<void> {
  cache.set(cacheKey(checked.externalUserId, checked.purpose), { ...checked, fetchedAtMs: nowMs, stale: false });
  if (checked.purpose === 'presence' && onAccepted) {
    try {
      await onAccepted(checked);
    } catch {
      // Keeping it for the background is best-effort; the call still has it.
    }
  }
}

export interface UserTokenContext {
  apiKey: string;
  externalUserId: string;
  purpose: UserTokenPurpose;
  /** This call's own provider; else the one set with setUserTokenProvider. */
  getUserToken?: UserTokenProvider;
}

export type TokenLookup = { token: string | null; mismatch: boolean };

/** The token to send, fetching one when none is cached, it is stale, or past half its life. */
export async function userTokenFor(
  ctx: UserTokenContext,
  options: { force?: boolean; now?: () => number } = {},
): Promise<TokenLookup> {
  const provider = ctx.getUserToken ?? registered;
  if (!provider) return { token: null, mismatch: false };
  const now = options.now ?? Date.now;
  const hit = cache.get(cacheKey(ctx.externalUserId, ctx.purpose));
  if (!options.force && usable(hit, now())) return { token: hit.token, mismatch: false };
  let body: unknown;
  try {
    body = await provider({ purpose: ctx.purpose });
  } catch {
    // A provider that fails (offline, its server down) is not the host saying
    // "no token": a token past half its life but still good is sent rather
    // than nothing, which a scoped key would refuse. Never after a refusal.
    const fallback = !options.force && hit && !hit.stale && now() < hit.expiresAtMs ? hit.token : null;
    return { token: fallback, mismatch: false };
  }
  if (body == null) return { token: null, mismatch: false };
  const checked = checkUserToken(body, ctx, now());
  if (!checked) {
    cache.delete(cacheKey(ctx.externalUserId, ctx.purpose));
    devWarnOnce('user_token_mismatch');
    return { token: null, mismatch: true };
  }
  await accept(checked, now());
  return { token: checked.token, mismatch: false };
}

/**
 * Hand the SDK a token the host already has, e.g. from a silent push, so a
 * device that has not been opened can keep reporting. Checked exactly as a
 * provider's answer is; throws UserTokenError('user_token_mismatch') when it
 * is not for `externalUserId` (default: the user the SDK is reporting for).
 */
export async function acceptUserToken(
  body: UserTokenResponse,
  expect: { externalUserId: string | null; apiKey: string | null },
  nowMs: number = Date.now(),
): Promise<CheckedUserToken> {
  const purpose = body?.purpose === 'biometric' ? 'biometric' : 'presence';
  const checked =
    expect.externalUserId && expect.apiKey
      ? checkUserToken(body, { externalUserId: expect.externalUserId, purpose, apiKey: expect.apiKey }, nowMs)
      : null;
  if (!checked) {
    devWarnOnce('user_token_mismatch');
    throw new UserTokenError('user_token_mismatch');
  }
  await accept(checked, nowMs);
  return checked;
}

// ─── One request, with one retry ─────────────────────────────────────────────

export interface SentWithToken {
  /** The last answer, or null when nothing was sent or nothing came back. */
  response: Response | null;
  /** Why it failed, when a user token is the reason. */
  refusal: UserTokenErrorCode | null;
}

async function refusalOf(response: Response): Promise<UserTokenRefusal | null> {
  try {
    return userTokenRefusal(await response.clone().json());
  } catch {
    return null;
  }
}

/**
 * Send one request with the user's token, when there is one. A 403
 * `user_token_invalid`, with a provider, gets one new token and one retry;
 * nothing else is retried (design section 14: never `user_token_required`).
 */
export async function sendWithUserToken(
  ctx: UserTokenContext,
  send: (headers: Record<string, string>) => Promise<Response | null>,
): Promise<SentWithToken> {
  const first = await userTokenFor(ctx);
  if (first.mismatch) return { response: null, refusal: 'user_token_mismatch' };
  let response = await send(userTokenHeaders(first.token));
  if (!response || response.ok) return { response, refusal: null };
  let refusal = await refusalOf(response);
  const hasProvider = Boolean(ctx.getUserToken ?? registered);
  if (hasProvider && refusal === 'user_token_invalid') {
    markUserTokenStale(ctx.externalUserId, ctx.purpose, first.token ?? undefined);
    const next = await userTokenFor(ctx, { force: true });
    if (next.mismatch) return { response, refusal: 'user_token_mismatch' };
    if (next.token) {
      response = await send(userTokenHeaders(next.token));
      if (!response || response.ok) return { response, refusal: null };
      refusal = await refusalOf(response);
    }
  }
  if (refusal) devWarnOnce(refusal);
  return { response, refusal };
}
