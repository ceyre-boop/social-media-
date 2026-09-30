import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/lib/auth';

/** Open a person's profile: your own name goes to You, everyone else to /u/[username]. */
export function useOpenProfile(): (username: string | null | undefined) => void {
  const router = useRouter();
  const { profile } = useAuth();
  const mine = profile?.username.toLowerCase();
  return useCallback(
    (username) => {
      if (!username) return;
      if (username.toLowerCase() === mine) router.navigate('/you');
      else router.push({ pathname: '/u/[username]', params: { username } });
    },
    [router, mine],
  );
}
