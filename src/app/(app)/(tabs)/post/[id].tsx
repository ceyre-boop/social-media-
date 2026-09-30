import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { PostViewer } from '@/components/posts/PostViewer';
import { usePost } from '@/components/posts/usePost';
import { AppBar, EmptyState, IconButton, PageTitle, Skeleton } from '@/components/ui';
import { parseStartTime } from '@/lib/share';
import { useTheme } from '@/lib/theme';

/** One post inside the app shell (signed-in view of the public /p/[id] link). Honors ?t=. */
export default function PostPage() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const post = usePost(id);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle
        title={
          post.status === 'ready'
            ? post.post.caption?.slice(0, 60) ||
              `Post by ${post.post.author?.username ?? 'someone'}`
            : 'Post'
        }
      />
      <AppBar title="Post" left={<IconButton icon="chevron-back" label="Back" onPress={back} />} />
      {post.status === 'ready' ? (
        <PostViewer post={post.post} start={parseStartTime(t)} />
      ) : post.status === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 24 }}>
          <Skeleton width={270} height={480} />
        </View>
      ) : post.status === 'error' ? (
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
          actionLabel="Go home"
          onAction={() => router.navigate('/')}
        />
      )}
    </View>
  );
}
