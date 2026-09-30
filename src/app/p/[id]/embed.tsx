import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { PostViewer } from '@/components/posts/PostViewer';
import { usePost } from '@/components/posts/usePost';
import { PageTitle, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import { parseStartTime } from '@/lib/share';
import { stage } from '@/lib/theme';

/**
 * Embeddable player (the iframe target): the media fills the frame, no navigation or sheets, and
 * one small attribution link. Only public posts embed; everything else reads as unavailable.
 */
export default function EmbedPost() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const post = usePost(id);

  return (
    <View style={{ flex: 1, backgroundColor: stage.bg }}>
      <PageTitle title="Embed" />
      {post.status === 'ready' && post.post.visibility === 'public' ? (
        <PostViewer post={post.post} start={parseStartTime(t)} mode="embed" linkAuthor={false} />
      ) : post.status === 'loading' ? null : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text tone="onMedia" align="center" variant="headline">
            This post isn&apos;t available
          </Text>
          <Text tone="onMediaMuted" align="center" variant="caption" style={{ marginTop: 6 }}>
            {brand.appName}
          </Text>
        </View>
      )}
    </View>
  );
}
