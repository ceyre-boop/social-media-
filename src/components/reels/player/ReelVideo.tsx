/**
 * One reel's media: the poster (expo-image) is always underneath; the borrowed pooled player's
 * VideoView sits on top at opacity 0 and fades in only after it has drawn its first frame, so a
 * black frame never shows. Portrait (aspect <= 0.8) fills; wider video is letterboxed over a
 * blurred copy of the poster.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import type { FeedPost } from '@/lib/posts';
import { motion, stage as c, useReducedMotion } from '@/lib/theme';

import { usePlayerPool, usePooledPlayer } from './PlayerPool';

type Props = { post: FeedPost };

const FIRST_FRAME_FALLBACK_MS = 250;

function ReelVideoImpl({ post }: Props) {
  const pool = usePlayerPool();
  const { player, current, paused, loaded } = usePooledPlayer(post.id);
  const reduce = useReducedMotion();
  const portrait = post.aspectRatio <= 0.8;
  const fit = portrait ? 'cover' : 'contain';

  // Opacity of the video layer. Starts visible only if this key already drew a frame.
  const shown = useSharedValue(0);
  const [drawnFor, setDrawnFor] = useState<unknown>(null);
  const drawn = player !== null && drawnFor === player;

  // A surface attached to a player: re-assert the pool's play/pause for it.
  useEffect(() => {
    if (player) pool.reapply();
  }, [player, pool]);

  const onFirstFrame = useCallback(() => {
    pool.markFirstFrame(post.id);
    setDrawnFor(player);
  }, [pool, post.id, player]);

  // Fallback: some surfaces (web video elements attached to an already-loaded player) never
  // emit a fresh first-frame event. Once the source is loaded a frame exists; show it shortly after.
  useEffect(() => {
    if (!player || !loaded || drawn) return;
    const t = setTimeout(onFirstFrame, FIRST_FRAME_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [player, loaded, drawn, onFirstFrame]);

  useEffect(() => {
    // Lost the slot (drawn=false): drop back to the poster instantly; fade in on a real frame.
    shown.set(drawn ? withTiming(1, { duration: motion.duration.instant }) : 0);
  }, [drawn, shown]);

  const videoStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  // Gentle play glyph while the user has paused the current reel.
  const glyph = useSharedValue(0);
  useEffect(() => {
    glyph.set(
      withTiming(current && paused ? 1 : 0, {
        duration: reduce ? motion.duration.instant : motion.duration.quick,
      }),
    );
  }, [current, paused, glyph, reduce]);
  const glyphStyle = useAnimatedStyle(() => ({ opacity: glyph.value * 0.9 }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]} pointerEvents="none">
      {post.posterUrl ? (
        <>
          {portrait ? null : (
            <>
              <Image
                source={{ uri: post.posterUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={40}
                recyclingKey={`${post.id}-bg`}
              />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
            </>
          )}
          <Image
            source={{ uri: post.posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit={fit}
            recyclingKey={post.id}
            priority={current ? 'high' : 'normal'}
            accessibilityLabel={post.caption ? `Video: ${post.caption}` : 'Video'}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.surface]} />
      )}
      {player ? (
        <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
          <VideoView
            player={player}
            nativeControls={false}
            contentFit={fit}
            allowsPictureInPicture={false}
            onFirstFrameRender={onFirstFrame}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {!post.videoUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="videocam-off-outline" size={40} color={c.muted} />
          <Text tone="onMediaMuted" style={styles.unavailable}>
            Video unavailable
          </Text>
        </View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, glyphStyle]}>
        <View style={styles.glyph}>
          <Ionicons name="play" size={44} color={c.text} />
        </View>
      </Animated.View>
    </View>
  );
}

export const ReelVideo = memo(ReelVideoImpl);

const styles = StyleSheet.create({
  stage: { backgroundColor: c.bg },
  surface: { backgroundColor: c.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  unavailable: { marginTop: 8 },
  glyph: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
    backgroundColor: c.control,
  },
});
