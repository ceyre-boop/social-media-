/**
 * One place that turns any thrown/returned error (Supabase Auth, PostgREST, Storage, fetch)
 * into copy a person can act on. Raw errors are logged in __DEV__ only.
 */

import { brand } from '@/config/brand';

export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'session'
  | 'forbidden'
  | 'conflict'
  | 'rate_limit'
  | 'code'
  | 'credentials'
  | 'password'
  | 'unconfirmed'
  | 'exists'
  | 'too_large'
  | 'age'
  | 'server'
  | 'unknown';

export type UserError = {
  kind: ErrorKind;
  title: string;
  message: string;
  /** True when trying the same action again might work. */
  retryable: boolean;
  /** Seconds to wait before retrying (rate limits). */
  retryAfter?: number;
  /** Raw message, only populated in __DEV__. */
  detail?: string;
};

/** Thrown by the fetch wrapper in supabase.ts when a request exceeds its time budget. */
export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

type Loose = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
  error_description?: unknown;
  error?: unknown;
  details?: unknown;
};

const NETWORK_RE =
  /failed to fetch|network request failed|networkerror|load failed|fetch failed|network error|internet connection|err_internet_disconnected|econnrefused|err_connection/i;

function read(e: unknown): { message: string; code: string; status: number; name: string } {
  if (typeof e === 'string') return { message: e, code: '', status: 0, name: '' };
  const o = (e ?? {}) as Loose;
  const nested = typeof o.error === 'object' && o.error ? (o.error as Loose) : null;
  const message = String(
    o.message ?? nested?.message ?? o.error_description ?? (typeof o.error === 'string' ? o.error : ''),
  );
  const code = String(o.code ?? nested?.code ?? '');
  const status = Number(o.status ?? o.statusCode ?? nested?.status ?? nested?.statusCode ?? 0) || 0;
  const name = String(o.name ?? '');
  return { message, code, status, name };
}

function make(
  kind: ErrorKind,
  title: string,
  message: string,
  retryable: boolean,
  extra: Partial<UserError> = {},
): UserError {
  return { kind, title, message, retryable, ...extra };
}

export function toUserError(e: unknown, scope = 'error'): UserError {
  const { message, code, status, name } = read(e);
  const m = message.toLowerCase();
  const c = code.toLowerCase();

  if (__DEV__) console.warn(`[${scope}]`, e);

  const out = classify(m, c, status, name, message);
  if (__DEV__ && message) out.detail = `${code ? `${code}: ` : ''}${message}`;
  return out;
}

function classify(m: string, c: string, status: number, name: string, raw: string): UserError {
  if (m.includes('video_too_long')) {
    return make('too_large', 'That reel is too long', 'Reels can be up to 30 seconds', false);
  }

  // Age rules enforced by the database at signup (migration 004).
  if (m.includes('under_minimum_age')) {
    return make('age', 'Too young', `You must be at least 13 to use ${brand.appName}.`, false);
  }
  if (m.includes('invalid_date_of_birth')) {
    return make('age', 'Check your date of birth', 'Enter a real date of birth in the past.', false);
  }
  if (m.includes('database error saving new user')) {
    return make(
      'age',
      'Could not create your account',
      'Check your date of birth (you must be at least 13) and try again.',
      false,
    );
  }

  if (name === 'RequestTimeoutError' || /timed out|timeout/.test(m) || status === 408 || status === 504) {
    return make(
      'timeout',
      'That took too long',
      'The server did not answer in time. Check your connection and try again.',
      true,
    );
  }
  if (NETWORK_RE.test(m) || name === 'AuthRetryableFetchError' || (name === 'TypeError' && !status)) {
    return make(
      'network',
      "You're offline",
      `We can't reach ${brand.appName} right now. Check your connection and try again.`,
      true,
    );
  }

  if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || c === 'over_sms_send_rate_limit' || status === 429 || /rate limit|too many requests|only request this after/.test(m)) {
    const secs = Number(/(\d+)\s*seconds?/.exec(m)?.[1] ?? 0) || undefined;
    return make(
      'rate_limit',
      'Too many tries',
      secs ? `Please wait ${secs} seconds and try again.` : 'Please wait a minute and try again.',
      true,
      { retryAfter: secs ?? 60 },
    );
  }

  // Password login. One generic message whether the email exists or not.
  if (c === 'invalid_credentials' || /invalid login credentials/.test(m)) {
    return make(
      'credentials',
      "That didn't work",
      "That email and password don't match.",
      false,
    );
  }
  if (c === 'email_not_confirmed' || /email not confirmed/.test(m)) {
    return make(
      'unconfirmed',
      'Confirm your email first',
      'Finish creating your account with the code we emailed you, or sign up again to get a new one.',
      false,
    );
  }
  if (c === 'weak_password' || /password should be at least|weak password|password is too (short|weak)/.test(m)) {
    return make(
      'password',
      'Choose a longer password',
      'Use at least 8 characters.',
      false,
    );
  }
  if (c === 'same_password' || /different from the old password/.test(m)) {
    return make(
      'password',
      'Pick a new password',
      "Choose a password you haven't used before.",
      false,
    );
  }
  if (c === 'email_exists' || c === 'user_already_exists' || /already (registered|been registered)/.test(m)) {
    return make(
      'exists',
      'Try logging in',
      "We couldn't create that account. If it's yours, log in instead.",
      false,
    );
  }

  if (c === 'otp_expired' || /token has expired or is invalid|otp.*(expired|invalid)|invalid.*otp|invalid token|token.*expired/.test(m)) {
    return make(
      'code',
      'That code did not work',
      'That code expired or is wrong. Send a new one.',
      false,
    );
  }

  if (
    status === 401 ||
    c === 'pgrst301' ||
    c === 'pgrst303' ||
    c === 'refresh_token_not_found' ||
    c === 'refresh_token_already_used' ||
    c === 'session_not_found' ||
    c === 'bad_jwt' ||
    /jwt expired|invalid jwt|refresh token|session (expired|not found)|not authenticated|auth session missing/.test(m)
  ) {
    return make('session', 'Your session ended', 'Sign in again to keep going.', false);
  }

  if (status === 413 || c === 'payload_too_large' || /payload too large|too large|exceeded the maximum allowed size/.test(m)) {
    return make('too_large', 'That file is too big', 'Pick a smaller photo (up to 15 MB).', false);
  }

  if (c === '23505') {
    if (/username/.test(m)) return make('conflict', 'Username taken', 'That username is taken.', false);
    if (/profiles_pkey/.test(m)) return make('conflict', 'Already set up', 'You already have a profile.', true);
    if (/likes/.test(m)) return make('conflict', 'Already liked', 'You already liked that.', false);
    return make('conflict', 'Already exists', 'That already exists.', false);
  }

  if (c === '42501' || status === 403 || /row-level security|row level security|permission denied|not allowed|forbidden|new row violates/.test(m)) {
    return make('forbidden', 'No access', "You don't have access to that.", false);
  }

  if (status >= 500 || /^5\d\d$/.test(c) || /internal server error|bad gateway|service unavailable/.test(m)) {
    return make(
      'server',
      `${brand.appName} is having trouble`,
      'Something broke on our side. Try again in a moment.',
      true,
    );
  }

  return make(
    'unknown',
    'Something went wrong',
    raw && __DEV__ ? raw : 'Something went wrong. Please try again.',
    true,
  );
}

/** Convenience for screens that only need the sentence. */
export function errorMessage(e: unknown, scope?: string): string {
  return toUserError(e, scope).message;
}
