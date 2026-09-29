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
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', uid)
    .maybeSingle();
  return data ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // The user id whose profile has been fetched (null = signed out / nothing fetched yet).
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
    fetchProfile(userId).then((p) => {
      if (cancelled) return;
      setProfile(p);
      setProfileFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = !sessionChecked || (userId !== null && profileFor !== userId);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setProfile(await fetchProfile(userId));
    setProfileFor(userId);
  }, [userId]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, session, profile: userId ? profile : null, refreshProfile, signOut }),
    [loading, session, userId, profile, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
