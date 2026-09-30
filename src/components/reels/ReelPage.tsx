import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ReelVideo } from '@/components/reels/player/ReelVideo';
import { usePlayerPool } from '@/components/reels/player/PlayerPool';
import { Avatar, Chip, Text } from '@/components/ui';
import { toggleMuted, useMuted } from '@/lib/mute';
import { useOpenProfile } from '@/lib/profileLink';
import { signImagePath, type FeedPost } from '@/lib/posts';
import { stage as c, tintFor, useReducedMotion } from '@/lib/theme';
import { relativeTime } from '@/lib/validation';
import { VISIBILITY_META } from '@/lib/visibility';

import { MoreSheet } from './MoreSheet';

const RAIL_W = 64;
/** One glyph size for every action-rail icon. */
const RAIL_ICON = 26;
const DOUBLE_TAP_MS = 280;
const LONG_PRESS_MS = 450;
const shadow = {
  textShadowColor: c.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

/** Big heart that pops over the media on double-tap. */
function HeartBurst({ trigger, reduce }: { trigger: number; reduce: boolean }) {
  const [anim] = useState(() => ({ o: new Animated.Value(0), s: new Animated.Value(0.4) }));
  useEffect(() => {
    if (trigger === 0) return;
    const native = Platform.OS !== 'web';
    anim.o.setValue(1);
    anim.s.setValue(reduce ? 1 : 0.4);
    Animated.parallel([
      Animated.spring(anim.s, { toValue: 1.15, friction: 5, useNativeDriver: native }),
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(anim.o, { toValue: 0, duration: 350, useNativeDriver: native }),
      ]),
    ]).start();
  }, [trigger, reduce, anim]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.burst, { opacity: anim.o, transform: [{ scale: anim.s }] }]}
    >
      <Ionicons name="heart" size={120} color={c.primary} />
    </Animated.View>
  );
}

function RailButton({
  icon,
  label,
  color = c.text,
  onPress,
  pop,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
  pop?: number;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!pop) return;
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 120, useNativeDriver: native }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: native }),
    ]).start();
  }, [pop, scale]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s) => {
        const hovered = (s as { hovered?: boolean }).hovered;
        return [
          styles.railBtn,
          { backgroundColor: hovered || s.pressed ? c.controlHover : c.control },
        ];
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={RAIL_ICON} color={color} />
      </Animated.View>
    </Pressable>
  );
}

/** Action rail: mute (reels), like (no count) and more. Over the media on compact, beside the card on desktop. */
function Rail({
  post,
  onToggleLike,
  onMore,
}: {
  post: FeedPost;
  onToggleLike: () => void;
  onMore: () => void;
}) {
  const [pop, setPop] = useState(0);
  const prevLiked = useRef(post.likedByMe);
  useEffect(() => {
    if (post.likedByMe && !prevLiked.current) setPop((n) => n + 1);
    prevLiked.current = post.likedByMe;
  }, [post.likedByMe]);
  return (
    <View style={styles.rail}>
      {post.kind === 'reel' ? <MuteButton /> : null}
      <RailButton
        icon={post.likedByMe ? 'heart' : 'heart-outline'}
        color={post.likedByMe ? c.primary : c.text}
        label={post.likedByMe ? 'Unlike' : 'Like'}
        onPress={onToggleLike}
        pop={pop}
      />
      <RailButton icon="ellipsis-horizontal" label="More" onPress={onMore} />
    </View>
  );
}

/** Global speaker toggle. Players follow via the mute store, not via this render. */
function MuteButton() {
  const muted = useMuted();
  return (
    <RailButton
      icon={muted ? 'volume-mute-outline' : 'volume-high-outline'}
      label={muted ? 'Unmute' : 'Mute'}
      onPress={toggleMuted}
    />
  );
}

function FollowPill({
  username,
  following,
  onPress,
}: {
  username: string;
  following: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={following ? `Unfollow @${username}` : `Follow @${username}`}
      accessibilityState={{ selected: following }}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={[styles.pill, following ? styles.pillOn : styles.pillOff]}
    >
      <Text variant="caption" weight="800" tone="onMedia">
        {following ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}

function Scrim({ position, size }: { position: 'top' | 'bottom'; size: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={position === 'bottom' ? [c.scrimClear, c.scrimBottom] : [c.scrimTop, c.scrimClear]}
      style={[styles.scrim, position === 'bottom' ? { bottom: 0 } : { top: 0 }, { height: size }]}
    />
  );
}

function TextCard({ post, w }: { post: FeedPost; w: number }) {
  const tint = tintFor(post.author?.username ?? 'unknown');
  const text = post.caption ?? '';
  const variant = text.length < 40 ? 'display' : text.length < 100 ? 'title' : 'headline';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}>
      <LinearGradient colors={[c.cardTop, c.cardBottom]} style={StyleSheet.absoluteFill} />
      <View style={[styles.textCenter, { paddingHorizontal: Math.min(32, w * 0.08) }]}>
        <Text selectable variant={variant} tone="onMedia" align="center">
          {text}
        </Text>
      </View>
    </View>
  );
}

function Media({ post, active, w }: { post: FeedPost; active: boolean; w: number }) {
  // Re-sign once if the URL expired; a fresh feed load (new imageUrl) wins over a stale fix.
  const [fix, setFix] = useState<{ from: string | null; url: string | null } | null>(null);
  const retried = useRef<string | null>(null);
  const url = fix && fix.from === post.imageUrl ? fix.url : post.imageUrl;

  function onError() {
    if (!post.imagePath || retried.current === post.imageUrl) return;
    retried.current = post.imageUrl;
    const from = post.imageUrl;
    void signImagePath(post.imagePath).then((u) => setFix({ from, url: u }));
  }

  if (!post.imagePath) return <TextCard post={post} w={w} />;

  if (!url) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.unavailable]}>
        <Ionicons name="image-outline" size={40} color={c.muted} />
        <Text tone="onMediaMuted" style={{ marginTop: 8 }}>
          Image unavailable
        </Text>
      </View>
    );
  }

  const portrait = post.aspectRatio <= 0.8;
  const priority = active ? 'high' : 'low';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      {portrait ? null : (
        <>
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
            priority={priority}
            recyclingKey={`${post.id}-bg`}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
        </>
      )}
      <Image
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        contentFit={portrait ? 'cover' : 'contain'}
        priority={priority}
        recyclingKey={post.id}
        onError={onError}
        accessibilityLabel={post.caption ? `Photo: ${post.caption}` : 'Photo'}
      />
    </View>
  );
}

function Caption({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 90 || text.includes('\n');
  return (
    <View>
      <Text selectable tone="onMedia" style={shadow} numberOfLines={open ? undefined : 2}>
        {text}
      </Text>
      {long ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Show less' : 'Show full caption'}
          onPress={() => setOpen((o) => !o)}
          hitSlop={8}
          style={styles.moreBtn}
        >
          <Text variant="callout" weight="700" tone="onMediaMuted" style={shadow}>
            {open ? 'less' : 'more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type Props = {
  post: FeedPost;
  /** 'full': fills width x height (compact). 'card': 9:16 card centered in the slot, rail outside. */
  variant: 'full' | 'card';
  width: number;
  height: number;
  /** Within one page of the settled page: images load at high priority. */
  active: boolean;
  /** Bottom space to keep text/rail clear of the floating nav (compact). */
  bottomInset: number;
  /** Stable callback: the rail heart toggles like/unlike. */
  onToggleLike: (post: FeedPost) => void;
  /** Stable callback: double-tap likes only, never unlikes. */
  onDoubleTapLike: (post: FeedPost) => void;
  /** Follow pill next to the name; hidden on your own posts. State only, never a count. */
  showFollow: boolean;
  following: boolean;
  /** Stable callback. */
  onToggleFollow: (authorId: string) => void;
};

function ReelPageImpl({
  post,
  variant,
  width,
  height,
  active,
  bottomInset,
  onToggleLike,
  onDoubleTapLike,
  showFollow,
  following,
  onToggleFollow,
}: Props) {
  const reduce = useReducedMotion();
  const openProfile = useOpenProfile();
  const pool = usePlayerPool();
  const [burst, setBurst] = useState(0);
  const [sheet, setSheet] = useState(false);
  const postId = post.id;
  const getCurrentTime = useCallback(() => pool.currentTimeOf(postId), [pool, postId]);
  const card = variant === 'card';
  const isReel = post.kind === 'reel';

  const cardH = Math.max(320, height - 32);
  const cardW = Math.min(cardH * (9 / 16), width - RAIL_W - 24);
  const w = card ? cardW : width;
  const h = card ? cardH : height;
  const username = post.author?.username ?? 'unknown';
  const name = post.author?.display_name || post.author?.username || 'Unknown';
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;
  const pad = card ? 20 : 16;

  // Tap = pause/resume (reels), double-tap = like, long-press = options. Exclusive: the single
  // tap waits for the double-tap to fail, so a like never also pauses.
  const longPress = Gesture.LongPress()
    .minDuration(LONG_PRESS_MS)
    .runOnJS(true)
    .onStart(() => setSheet(true));
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(DOUBLE_TAP_MS)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (!success) return;
      setBurst((n) => n + 1);
      if (!post.likedByMe) onDoubleTapLike(post);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success && isReel) pool.togglePause(post.id);
    });
  const gesture = Gesture.Exclusive(longPress, doubleTap, tap);

  const content = (
    <View
      style={[{ width: w, height: h, backgroundColor: c.bg }, card && styles.cardShape]}
      accessible={false}
    >
      <GestureDetector gesture={gesture}>
        <View
          accessible={false}
          collapsable={false}
          style={StyleSheet.absoluteFill}
          // Keep native long-press/drag from selecting the media on web.
          {...(Platform.OS === 'web' ? ({ dataSet: { reelMedia: '1' } } as object) : null)}
        >
          {isReel ? <ReelVideo post={post} /> : <Media post={post} active={active} w={w} />}
          <Scrim position="top" size={120} />
          <Scrim position="bottom" size={Math.min(h * 0.5, 340)} />
          <HeartBurst trigger={burst} reduce={reduce} />
        </View>
      </GestureDetector>
      {/* Overlay: box-none, so taps on empty areas fall through to the media gestures. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.info,
          {
            paddingHorizontal: pad,
            paddingBottom: (card ? 20 : bottomInset) + 4,
            paddingRight: card ? pad : pad + RAIL_W,
          },
        ]}
      >
        {vis ? (
          <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
            <Chip label={vis.label} icon={vis.icon} />
          </View>
        ) : null}
        {/* Avatar, name and @username all open the author's profile (your own goes to You). */}
        <View style={styles.author} pointerEvents="box-none">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${name}'s profile`}
            disabled={!post.author}
            onPress={() => openProfile(post.author?.username)}
            style={styles.profileHit}
          >
            <Avatar username={username} displayName={post.author?.display_name} size={40} />
          </Pressable>
          <View style={{ flex: 1 }} pointerEvents="box-none">
            <View style={styles.nameRow} pointerEvents="box-none">
              <Text
                variant="headline"
                tone="onMedia"
                numberOfLines={1}
                style={[shadow, styles.profileHit, { flexShrink: 1 }]}
                accessibilityRole={post.author ? 'link' : undefined}
                onPress={post.author ? () => openProfile(post.author?.username) : undefined}
              >
                {name}
              </Text>
              {showFollow ? (
                <FollowPill
                  username={username}
                  following={following}
                  onPress={() => onToggleFollow(post.author_id)}
                />
              ) : null}
            </View>
            <Text variant="caption" tone="onMediaMuted" numberOfLines={1} style={shadow}>
              {post.author ? (
                <Text
                  variant="caption"
                  tone="onMediaMuted"
                  style={[shadow, styles.profileHit]}
                  accessibilityRole="link"
                  onPress={() => openProfile(post.author?.username)}
                >
                  @{post.author.username}
                </Text>
              ) : null}
              {post.author ? ' · ' : ''}
              {relativeTime(post.created_at)}
            </Text>
          </View>
        </View>
        {post.caption && (post.imagePath || isReel) ? <Caption text={post.caption} /> : null}
      </View>
      {card ? null : (
        <View pointerEvents="box-none" style={[styles.railHost, { bottom: bottomInset + 4 }]}>
          <Rail post={post} onToggleLike={() => onToggleLike(post)} onMore={() => setSheet(true)} />
        </View>
      )}
    </View>
  );

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${isReel ? 'Reel' : 'Post'} by @${username}`}
      {...({ dataSet: { reelPage: '1' } } as object)}
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12,
      }}
    >
      {content}
      {card ? (
        <View style={{ height: h, justifyContent: 'flex-end', paddingBottom: 8 }}>
          <Rail post={post} onToggleLike={() => onToggleLike(post)} onMore={() => setSheet(true)} />
        </View>
      ) : null}
      <MoreSheet
        visible={sheet}
        post={post}
        getCurrentTime={getCurrentTime}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

/** Memoized: a settle re-renders only pages whose props (e.g. `active`) changed. */
export const ReelPage = memo(ReelPageImpl);

const styles = StyleSheet.create({
  profileHit: { cursor: 'pointer' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pillOff: { borderWidth: 1.5, borderColor: c.pillBorder },
  pillOn: { backgroundColor: c.pillFill },
  cardShape: { borderRadius: 24, overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0 },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreBtn: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  railHost: { position: 'absolute', right: 8 },
  rail: { width: RAIL_W, alignItems: 'center', gap: 14 },
  railBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  burst: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unavailable: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
});
