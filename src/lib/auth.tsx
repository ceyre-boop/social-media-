import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Database } from '@/lib/db/types';
import { toUserError, type UserError } from '@/lib/errors';
import { releasePushToken } from '@/lib/push';
import { configMissing, supabase } from '@/lib/supabase';

export type Profile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'user_id' | 'username' | 'display_name' | 'bio' | 'avatar_media_id' | 'link_url'
>;

const PROFILE_COLUMNS = 'user_id, username, display_name, bio, avatar_media_id, link_url';

export const SESSION_ENDED_NOTICE = 'Your session ended. Sign in again.';

type AuthState = {
  /** True until the persisted session (and profile) have been read once. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Set when loading the profile failed (as opposed to it not existing). */
  profileError: UserError | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  /** One-time message for the sign-in screen (e.g. the session ended). */
  notice: string | null;
  clearNotice: () => void;
  /** Maps an error for display; if it means "session over", ends the session with a notice. */
  handleError: (e: unknown, scope?: string) => UserError;
};

const AuthContext = createContext<AuthState | null>(null);

/** Resolves null only when the profile row genuinely does not exist; throws on any error. */
async function fetchProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Same account and same tokens: keep the existing object so nothing downstream re-renders. */
function sameSession(a: Session | null, b: Session | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.user.id === b.user.id &&
    a.access_token === b.access_token &&
    a.refresh_token === b.refresh_token
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(configMissing);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<UserError | null>(null);
  // The user id whose profile has been fetched (null = signed out / nothing fetched yet).
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const userInitiatedSignOut = useRef(false);

  const userId = session?.user.id ?? null;

  const applySession = useCallback((next: Session | null) => {
    setSession((prev) => (sameSession(prev, next) ? prev : next));
    sessionRef.current = next;
  }, []);

  useEffect(() => {
    if (configMissing) return;
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch((e) => toUserError(e, 'getSession'))
      .finally(() => setSessionChecked(true));

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // INITIAL_SESSION duplicates getSession() above; handling it re-sets an equal session.
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' && sessionRef.current && !userInitiatedSignOut.current) {
        setNotice(SESSION_ENDED_NOTICE);
      }
      if (event === 'SIGNED_OUT') userInitiatedSignOut.current = false;
      applySession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [applySession]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId)
      .then(async (p) => {
        if (cancelled) return;
        // No profile usually means "new user → onboarding". But a cached session can outlive its
        // account (deleted, banned, or a wiped dev DB): getSession() never asks the server. Before
        // routing to onboarding, confirm the account still exists; if the server rejects it, sign
        // out locally instead of showing a form whose insert can only fail.
        if (!p) {
          const { error } = await supabase.auth.getUser();
          if (cancelled) return;
          if (error && error.status !== undefined && error.status >= 400 && error.status < 500) {
            setNotice(SESSION_ENDED_NOTICE);
            userInitiatedSignOut.current = true;
            await supabase.auth.signOut({ scope: 'local' });
            return;
          }
        }
        setProfile(p);
        setProfileError(null);
        setProfileFor(userId);
      })
      .catch((e) => {
        if (cancelled) return;
        setProfileError(toUserError(e, 'fetchProfile'));
        setProfileFor(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = !sessionChecked || (userId !== null && profileFor !== userId);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setProfile(await fetchProfile(userId));
      setProfileError(null);
    } catch (e) {
      setProfileError(toUserError(e, 'refreshProfile'));
    }
    setProfileFor(userId);
  }, [userId]);

  const signOut = useCallback(async () => {
    userInitiatedSignOut.current = true;
    // While still signed in: this phone stops receiving this account's pushes.
    await releasePushToken();
    const { error } = await supabase.auth.signOut();
    // Offline (or server down): still leave. Clearing the local session is what matters.
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const handleError = useCallback((e: unknown, scope?: string) => {
    const err = toUserError(e, scope);
    if (err.kind === 'session' && sessionRef.current) {
      setNotice(SESSION_ENDED_NOTICE);
      userInitiatedSignOut.current = true; // notice already set; avoid the listener doing it twice
      void supabase.auth.signOut({ scope: 'local' });
    }
    return err;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile: userId ? profile : null,
      profileError,
      refreshProfile,
      signOut,
      notice,
      clearNotice,
      handleError,
    }),
    [
      loading,
      session,
      userId,
      profile,
      profileError,
      refreshProfile,
      signOut,
      notice,
      clearNotice,
      handleError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
