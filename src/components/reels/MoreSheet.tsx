import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { FeedPost } from '@/lib/posts';
import {
  NON_PUBLIC_NOTE,
  SHARE_TARGETS,
  embedCode,
  formatTime,
  postUrl,
  shareText,
  startAtLabel,
} from '@/lib/share';
import { canSaveVideo, copyText, openExternal, saveVideo, shareNative } from '@/lib/shareActions';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

type IconName = keyof typeof Ionicons.glyphMap;

/** One neutral tile: outline icon in a neutral disc, one-line label. Same treatment for every action. */
function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s) => {
        const hovered = (s as { hovered?: boolean }).hovered;
        return [
          styles.tile,
          { gap: spacing.xs, opacity: s.pressed ? 0.7 : 1 },
          hovered && { opacity: 0.85 },
        ];
      }}
    >
      <View style={[styles.disc, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Ionicons name={icon} size={24} color={colors.textSecondary} />
      </View>
      <Text variant="caption" tone="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The "..." sheet: Share (system sheet, copy link, copy at the current time, save, embed, and
 * thirteen direct targets) and who can see the post. Non-public posts only get the copy/share
 * basics plus a one-line note; embed and public targets are never offered for them.
 */
export function MoreSheet({
  visible,
  post,
  getCurrentTime,
  onClose,
}: {
  visible: boolean;
  post: FeedPost;
  /** Playback position in seconds (reels), read when the sheet opens. */
  getCurrentTime?: () => number | null;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const meta = VISIBILITY_META[post.visibility];
  const isPublic = post.visibility === 'public';
  const isReel = post.kind === 'reel';

  const [startAt, setStartAt] = useState<number | null>(null);
  // Capture the playback position at the moment the sheet opens (adjust state during render).
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const t = getCurrentTime?.();
      setStartAt(t !== null && t !== undefined && t >= 1 ? Math.floor(t) : null);
    }
  }

  const link = postUrl(post.id);
  const text = shareText(post);

  const done = (message: string) => {
    onClose();
    toast.show({ message, tone: 'success' });
  };
  const fail = (message: string) => toast.show({ message, tone: 'danger' });

  async function onNativeShare() {
    try {
      const r = await shareNative({ url: link, text });
      if (r === 'copied') done('Link copied');
      else onClose();
    } catch {
      fail('Could not open the share sheet.');
    }
  }
  async function onCopy(url: string, message: string) {
    try {
      await copyText(url);
      done(message);
    } catch {
      fail('Could not copy the link.');
    }
  }
  async function onSave() {
    try {
      onClose();
      toast.show({ message: 'Saving video...' });
      await saveVideo(post);
      toast.show({
        message: Platform.OS === 'web' ? 'Video downloaded' : 'Saved to your photos',
        tone: 'success',
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the video.');
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Share" scroll>
      <View style={{ gap: spacing.lg, paddingTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name={meta.icon} size={24} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="callout" weight="700">
              {meta.label}
            </Text>
            <Text variant="caption" tone="secondary" style={{ marginTop: spacing.xxs }}>
              {isPublic ? meta.explain : NON_PUBLIC_NOTE}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <Tile icon="share-outline" label="Share..." onPress={onNativeShare} />
          <Tile icon="link-outline" label="Copy link" onPress={() => onCopy(link, 'Link copied')} />
          {isReel && startAt !== null ? (
            <Tile
              icon="time-outline"
              label={startAtLabel(startAt)}
              onPress={() =>
                onCopy(postUrl(post.id, startAt), `Link copied, starts at ${formatTime(startAt)}`)
              }
            />
          ) : null}
          {isReel && canSaveVideo(post, me) ? (
            <Tile icon="download-outline" label="Save video" onPress={onSave} />
          ) : null}
          {isPublic && isReel && Platform.OS === 'web' ? (
            <Tile
              icon="code-slash-outline"
              label="Embed"
              onPress={() => onCopy(embedCode(post.id), 'Embed code copied')}
            />
          ) : null}
          {isPublic
            ? SHARE_TARGETS.map((t) => (
                <Tile
                  key={t.id}
                  icon={t.icon}
                  label={t.label}
                  onPress={() => {
                    openExternal(t.href(link, text));
                    onClose();
                  }}
                />
              ))
            : null}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  tile: { width: '25%', alignItems: 'center', cursor: 'pointer' },
  disc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
