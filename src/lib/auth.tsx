import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Database } from '@/lib/db/types';
import { supabase } from '@/lib/supabase';

export type Profile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'user_id' | 'username' | 'display_name' | 'bio' | 'avatar_media_id' | 'link_url'
>;

const PROFILE_COLUMNS = 'user_id, username, display_name, bio, avatar_media_id, link_url';

type AuthState = {
  /** True until the persisted session (and profile) have been read once. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** True when loading the profile failed (as opposed to it not existing). */
  profileError: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // The user id whose profile has been fetched (null = signed out / nothing fetched yet).
  const [profileError, setProfileError] = useState(false);
  const [profileFor, setProfileFor] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile(userId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setProfileError(false);
        setProfileFor(userId);
      })
      .catch((e) => {
        if (cancelled) return;
        if (__DEV__) console.warn("fetchProfile failed:", e);
        setProfileError(true);
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
      setProfileError(false);
    } catch (e) {
      if (__DEV__) console.warn("fetchProfile failed:", e);
      setProfileError(true);
    }
    setProfileFor(userId);
  }, [userId]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, session, profile: userId ? profile : null, profileError, refreshProfile, signOut }),
    [loading, session, userId, profile, profileError, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
