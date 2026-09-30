import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { MoreSheet } from '@/components/reels/MoreSheet';
import { Avatar, Text } from '@/components/ui';
import { brand } from '@/config/brand';
import type { FeedPost } from '@/lib/posts';
import { useOpenProfile } from '@/lib/profileLink';
import { postUrl } from '@/lib/share';
import { stage as c, tintFor } from '@/lib/theme';
import { relativeTime } from '@/lib/validation';

const ICON = 26;

// Player properties are set outside components: they are imperative handles, not React state.
function seekTo(p: VideoPlayer, seconds: number): void {
  p.currentTime = seconds;
}
function playPlayer(p: VideoPlayer): void {
  p.play();
}
function setPlayerMuted(p: VideoPlayer, muted: boolean): void {
  p.muted = muted;
}
const CARD_MIN_WIDTH = 500;

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s) => [styles.round, { backgroundColor: s.pressed ? c.controlHover : c.control }]}
    >
      <Ionicons name={icon} size={ICON} color={c.text} />
    </Pressable>
  );
}

/** A reel: poster underneath, looping muted video on top; tap pauses, `start` seeks once ready. */
function ReelMedia({
  post,
  start,
  onPlayer,
}: {
  post: FeedPost;
  start: number | null;
  onPlayer: (player: VideoPlayer) => void;
}) {
  const player = useVideoPlayer(post.videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const seeked = useRef(false);

  useEffect(() => {
    onPlayer(player);
  }, [player, onPlayer]);

  useEffect(() => {
    const seek = () => {
      if (seeked.current) return;
      seeked.current = true;
      if (start && start > 0) seekTo(player, start);
      playPlayer(player);
    };
    if (player.status === 'readyToPlay') seek();
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') seek();
    });
    return () => sub.remove();
  }, [player, start]);

  const portrait = post.aspectRatio <= 0.8;
  const fit = portrait ? 'cover' : 'contain';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {post.posterUrl ? (
        <Image source={{ uri: post.posterUrl }} style={StyleSheet.absoluteFill} contentFit={fit} />
      ) : null}
      {post.videoUrl ? (
        <VideoView
          player={player}
          nativeControls={false}
          contentFit={fit}
          allowsPictureInPicture={false}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.center}>
          <Ionicons name="videocam-off-outline" size={40} color={c.muted} />
          <Text tone="onMediaMuted">Video unavailable</Text>
        </View>
      )}
    </View>
  );
}

function Media({
  post,
  start,
  onPlayer,
}: {
  post: FeedPost;
  start: number | null;
  onPlayer: (player: VideoPlayer) => void;
}) {
  if (post.kind === 'reel') return <ReelMedia post={post} start={start} onPlayer={onPlayer} />;
  if (post.imageUrl) {
    return (
      <Image
        source={{ uri: post.imageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit={post.aspectRatio <= 0.8 ? 'cover' : 'contain'}
        accessibilityLabel={post.caption ? `Photo: ${post.caption}` : 'Photo'}
      />
    );
  }
  const tint = tintFor(post.author?.username ?? 'unknown');
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: tint, padding: 28 }]}>
      <LinearGradient colors={[c.cardTop, c.cardBottom]} style={StyleSheet.absoluteFill} />
      <Text selectable variant="title" tone="onMedia" align="center">
        {post.caption ?? ''}
      </Text>
    </View>
  );
}

/**
 * A single post on the stage. `page` shows the author, caption and share; `embed` is chrome-free
 * apart from a small attribution link. Sized to whatever space its parent gives it: a 9:16 card
 * on wide screens, full-bleed on phones.
 */
export function PostViewer({
  post,
  start,
  mode = 'page',
  linkAuthor = true,
}: {
  post: FeedPost;
  start?: number | null;
  mode?: 'page' | 'embed';
  /** False when signed out: profiles need an account. */
  linkAuthor?: boolean;
}) {
  const win = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [muted, setMuted] = useState(true);
  const onPlayer = useCallback((p: VideoPlayer) => setPlayer(p), []);
  const getTime = useCallback(() => player?.currentTime ?? null, [player]);
  function toggleMute() {
    if (!player) return;
    setPlayerMuted(player, !muted);
    setMuted(!muted);
  }
  const openProfile = useOpenProfile();

  const embed = mode === 'embed';
  const w = box?.w ?? win.width;
  const h = box?.h ?? win.height;
  const full = embed || w < CARD_MIN_WIDTH;
  const cardH = full ? h : Math.max(320, h - 32);
  const cardW = full ? w : Math.min(cardH * (9 / 16), w - 24);
  const name = post.author?.display_name || post.author?.username || 'Unknown';
  const username = post.author?.username ?? 'unknown';
  const canOpen = linkAuthor && !!post.author && !embed;

  return (
    <View
      style={styles.host}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View
        style={[
          { width: cardW, height: cardH, backgroundColor: c.bg, overflow: 'hidden' },
          !full && styles.card,
        ]}
        accessible={false}
      >
        <Media post={post} start={start ?? null} onPlayer={onPlayer} />
        <LinearGradient
          pointerEvents="none"
          colors={[c.scrimClear, c.scrimBottom]}
          style={[styles.scrim, { height: Math.min(cardH * 0.45, 320) }]}
        />
        {embed ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Watch on ${brand.appName}`}
            onPress={() => void Linking.openURL(postUrl(post.id))}
            style={styles.attribution}
          >
            <Text variant="caption" weight="700" tone="onMedia">
              Watch on {brand.appName}
            </Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.info} pointerEvents="box-none">
              <View style={styles.author} pointerEvents="box-none">
                <Pressable
                  accessibilityRole={canOpen ? 'link' : undefined}
                  accessibilityLabel={`${name}'s profile`}
                  disabled={!canOpen}
                  onPress={() => openProfile(post.author?.username)}
                >
                  <Avatar username={username} displayName={post.author?.display_name} size={40} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text
                    variant="headline"
                    tone="onMedia"
                    numberOfLines={1}
                    accessibilityRole={canOpen ? 'link' : undefined}
                    onPress={canOpen ? () => openProfile(post.author?.username) : undefined}
                  >
                    {name}
                  </Text>
                  <Text variant="caption" tone="onMediaMuted" numberOfLines={1}>
                    @{username} · {relativeTime(post.created_at)}
                  </Text>
                </View>
              </View>
              {post.caption && (post.imagePath || post.kind === 'reel') ? (
                <Text selectable tone="onMedia" numberOfLines={3}>
                  {post.caption}
                </Text>
              ) : null}
            </View>
            <View style={styles.actions} pointerEvents="box-none">
              {post.kind === 'reel' ? (
                <RoundButton
                  icon={muted ? 'volume-mute-outline' : 'volume-high-outline'}
                  label={muted ? 'Unmute' : 'Mute'}
                  onPress={toggleMute}
                />
              ) : null}
              <RoundButton icon="ellipsis-horizontal" label="More" onPress={() => setSheet(true)} />
            </View>
          </>
        )}
      </View>
      {embed ? null : (
        <MoreSheet
          visible={sheet}
          post={post}
          getCurrentTime={getTime}
          onClose={() => setSheet(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  card: { borderRadius: 24, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 10,
    paddingRight: 80,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { position: 'absolute', right: 12, bottom: 16, gap: 14 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  attribution: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    minHeight: 32,
    justifyContent: 'center',
  },
});
