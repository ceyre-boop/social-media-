import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchPostById, type FeedPost } from '@/lib/posts';

export type PostState =
  | { status: 'loading' }
  | { status: 'ready'; post: FeedPost }
  | { status: 'missing' }
  | { status: 'error' };

type Settled = Exclude<PostState, { status: 'loading' }>;

/** Load one post for the current viewer (signed in or out). Missing and hidden look the same. */
export function usePost(id: string | undefined): PostState & { retry: () => void } {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const key = `${id}|${me}|${attempt}`;
  const [result, setResult] = useState<{ key: string; state: Settled } | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchPostById(id, me)
      .then((post) => {
        if (live)
          setResult({ key, state: post ? { status: 'ready', post } : { status: 'missing' } });
      })
      .catch(() => {
        if (live) setResult({ key, state: { status: 'error' } });
      });
    return () => {
      live = false;
    };
  }, [id, me, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: PostState = !id
    ? { status: 'missing' }
    : result?.key === key
      ? result.state
      : { status: 'loading' };
  return { ...state, retry };
}
