import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { PostViewer } from '@/components/posts/PostViewer';
import { usePost } from '@/components/posts/usePost';
import { Brand, Button, EmptyState, PageTitle, Skeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { parseStartTime } from '@/lib/share';
import { useTheme } from '@/lib/theme';

/**
 * Public single-post page: works signed out for public posts. Signed-in people are sent to the
 * same page inside the app shell (/post/[id]); the shared link stays /p/[id].
 */
export default function PublicPost() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const { session, profile } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const post = usePost(id);
  const start = parseStartTime(t);

  if (session && profile) {
    return <Redirect href={{ pathname: '/post/[id]', params: { id, ...(t ? { t } : {}) } }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Brand size={28} />
        <Button
          title="Sign in"
          variant="secondary"
          size="sm"
          onPress={() => router.navigate('/welcome')}
        />
      </View>
      {post.status === 'ready' ? (
        <>
          <PageTitle
            title={
              post.post.caption?.slice(0, 60) ||
              `Post by ${post.post.author?.username ?? 'someone'}`
            }
          />
          <PostViewer post={post.post} start={start} linkAuthor={false} />
        </>
      ) : post.status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton width={270} height={480} />
        </View>
      ) : (
        <>
          <PageTitle title="Post" />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {post.status === 'error' ? (
              <EmptyState
                compact
                title="Something went wrong"
                message="We couldn't load this post."
                actionLabel="Try again"
                onAction={post.retry}
              />
            ) : (
              <EmptyState
                compact
                title="This post isn't available"
                message="It may have been removed, or it isn't shared with you."
                actionLabel="Sign in"
                onAction={() => router.navigate('/welcome')}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}
