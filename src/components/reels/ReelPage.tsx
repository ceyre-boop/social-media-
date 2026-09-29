import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar, Chip } from '@/components/ui';
import { signImagePath, type FeedPost } from '@/lib/posts';
import { palettes, tintFor } from '@/lib/theme';
import { relativeTime } from '@/lib/validation';
import { VISIBILITY_META } from '@/lib/visibility';

import { MoreSheet } from './MoreSheet';

const c = palettes.dark;
const RAIL_W = 64;
const DOUBLE_TAP_MS = 320;
const shadow = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

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
  color = '#FFFFFF',
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
          { backgroundColor: hovered || s.pressed ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)' },
        ];
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={28} color={color} />
      </Animated.View>
    </Pressable>
  );
}

/** Action rail: like (no count) and more. Sits over the media on compact, outside the card on desktop. */
function Rail({ post, onToggleLike }: { post: FeedPost; onToggleLike: () => void }) {
  const [sheet, setSheet] = useState(false);
  const [pop, setPop] = useState(0);
  const prevLiked = useRef(post.likedByMe);
  useEffect(() => {
    if (post.likedByMe && !prevLiked.current) setPop((n) => n + 1);
    prevLiked.current = post.likedByMe;
  }, [post.likedByMe]);
  return (
    <View style={styles.rail}>
      <RailButton
        icon={post.likedByMe ? 'heart' : 'heart-outline'}
        color={post.likedByMe ? c.primary : '#FFFFFF'}
        label={post.likedByMe ? 'Unlike' : 'Like'}
        onPress={onToggleLike}
        pop={pop}
      />
      <RailButton icon="ellipsis-horizontal" label="More" onPress={() => setSheet(true)} />
      <MoreSheet visible={sheet} visibility={post.visibility} onClose={() => setSheet(false)} />
    </View>
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
      <Text style={styles.pillText}>{following ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

function Scrim({ position, size }: { position: 'top' | 'bottom'; size: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={
        position === 'bottom'
          ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']
          : ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']
      }
      style={[styles.scrim, position === 'bottom' ? { bottom: 0 } : { top: 0 }, { height: size }]}
    />
  );
}

function TextCard({ post, w }: { post: FeedPost; w: number }) {
  const tint = tintFor(post.author?.username ?? 'unknown');
  const text = post.caption ?? '';
  const size = text.length < 40 ? 34 : text.length < 100 ? 28 : 24;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}>
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(20,10,30,0.72)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.textCenter, { paddingHorizontal: Math.min(32, w * 0.08) }]}>
        <Text selectable style={[styles.bigText, { fontSize: size, lineHeight: size * 1.25 }]}>
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
        <Text style={{ color: c.muted, marginTop: 8 }}>Image unavailable</Text>
      </View>
    );
  }

  const portrait = post.aspectRatio <= 0.8;
  const priority = active ? 'high' : 'low';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
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
      <Text selectable style={[styles.caption, shadow]} numberOfLines={open ? undefined : 2}>
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
          <Text style={[styles.moreText, shadow]}>{open ? 'less' : 'more'}</Text>
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
  active: boolean;
  /** Bottom space to keep text/rail clear of the floating nav (compact). */
  bottomInset: number;
  onToggleLike: () => void;
  /** Double-tap: like only, never unlike. */
  onDoubleTapLike: () => void;
  /** Follow pill next to the name; hidden on your own posts. State only, never a count. */
  showFollow: boolean;
  following: boolean;
  onToggleFollow: () => void;
};

export function ReelPage({
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
  const reduce = useReduceMotion();
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const card = variant === 'card';

  const cardH = Math.max(320, height - 32);
  const cardW = Math.min(cardH * (9 / 16), width - RAIL_W - 24);
  const w = card ? cardW : width;
  const h = card ? cardH : height;
  const username = post.author?.username ?? 'unknown';
  const name = post.author?.display_name || post.author?.username || 'Unknown';
  const vis = post.visibility !== 'public' ? VISIBILITY_META[post.visibility] : null;
  const pad = card ? 20 : 16;

  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      setBurst((n) => n + 1);
      if (!post.likedByMe) onDoubleTapLike();
    } else {
      lastTap.current = now;
    }
  }

  const content = (
    <View
      style={[{ width: w, height: h, backgroundColor: '#000' }, card && styles.cardShape]}
      accessible={false}
    >
      <Pressable
        accessible={false}
        onPress={onTap}
        style={StyleSheet.absoluteFill}
        // Keep native long-press/drag from selecting the media on web.
        {...(Platform.OS === 'web' ? { focusable: false } : null)}
      >
        <Media post={post} active={active} w={w} />
        <Scrim position="top" size={120} />
        <Scrim position="bottom" size={Math.min(h * 0.5, 340)} />
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
          {/* Not interactive: no other-user profiles exist yet. */}
          <View style={styles.author}>
            <Avatar username={username} displayName={post.author?.display_name} size={40} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={[styles.name, shadow, { flexShrink: 1 }]}>
                  {name}
                </Text>
                {showFollow ? (
                  <FollowPill username={username} following={following} onPress={onToggleFollow} />
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.handle, shadow]}>
                {post.author ? `@${post.author.username} · ` : ''}
                {relativeTime(post.created_at)}
              </Text>
            </View>
          </View>
          {post.caption && post.imagePath ? <Caption text={post.caption} /> : null}
        </View>
        <HeartBurst trigger={burst} reduce={reduce} />
      </Pressable>
      {card ? null : (
        <View pointerEvents="box-none" style={[styles.railHost, { bottom: bottomInset + 4 }]}>
          <Rail post={post} onToggleLike={onToggleLike} />
        </View>
      )}
    </View>
  );

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Post by @${username}`}
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
          <Rail post={post} onToggleLike={onToggleLike} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pillOff: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  pillOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  pillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  cardShape: { borderRadius: 24, overflow: 'hidden' },
  scrim: { position: 'absolute', left: 0, right: 0 },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  handle: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  caption: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  moreBtn: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  moreText: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 15 },
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
  bigText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  unavailable: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
});
