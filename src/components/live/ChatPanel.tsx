import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { IconButton, Text } from '@/components/ui';
import type { ChatMessage } from '@/lib/live/stub';
import { fontFamilyFor, useReducedMotion, useTheme } from '@/lib/theme';

export type ChatEntry = ChatMessage & {
  /** Present from the first render: no entry animation. */
  initial?: boolean;
};

type ListProps = {
  messages: ChatEntry[];
  /** Overlay on the video (phone) or the right column (desktop). */
  variant: 'overlay' | 'column';
  maxHeight?: number;
};

/** Height of the fade at the top edge of the phone overlay. */
const FADE_PX = 28;

/**
 * Fades its children out over the top FADE_PX instead of hard-clipping a bubble. Web uses a CSS
 * mask; native uses MaskedView with a gradient alpha mask.
 */
function TopFade({ children, style }: { children: React.ReactNode; style: object }) {
  const { stage } = useTheme();
  if (Platform.OS === 'web') {
    const mask = `linear-gradient(to bottom, transparent 0, black ${FADE_PX}px)`;
    return (
      <View style={[style, { maskImage: mask, WebkitMaskImage: mask } as object]}>{children}</View>
    );
  }
  return (
    <MaskedView
      style={style}
      maskElement={
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[stage.scrimClear, stage.bg]} style={{ height: FADE_PX }} />
          <View style={{ flex: 1, backgroundColor: stage.bg }} />
        </View>
      }
    >
      {children}
    </MaskedView>
  );
}

/** Chat messages with a gentle entry animation (fade only under reduced motion). */
export function ChatList({ messages, variant, maxHeight }: ListProps) {
  const { stage, spacing, radius, motion } = useTheme();
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const bubble = variant === 'overlay' ? stage.controlHover : stage.surface2;

  const overlay = variant === 'overlay';
  const list = (
    <ScrollView
      ref={scroller}
      style={{ flex: 1 }}
      contentContainerStyle={{
        gap: spacing.xs + 2,
        paddingHorizontal: spacing.md,
        paddingBottom: overlay ? spacing.xs : spacing.md,
        // The overlay keeps room at the top for the fade so the oldest visible bubble dissolves.
        paddingTop: overlay ? FADE_PX : spacing.md,
        justifyContent: 'flex-end',
        flexGrow: 1,
      }}
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: !reduce })}
      accessibilityLabel="Chat"
      accessibilityLiveRegion="polite"
      showsVerticalScrollIndicator={false}
    >
      {messages.map((m) => {
        const entering = m.initial
          ? undefined
          : reduce
            ? FadeIn.duration(motion.duration.quick)
            : FadeInDown.duration(motion.duration.base).springify().damping(18);
        return (
          <Animated.View
            key={m.id}
            entering={entering}
            style={{
              alignSelf: 'flex-start',
              maxWidth: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.xs + 1,
              paddingHorizontal: spacing.sm + 2,
              borderRadius: radius.md,
              backgroundColor: bubble,
            }}
          >
            <Text variant="caption" tone="onMedia" style={{ flexShrink: 1 }}>
              <Text variant="caption" tone="onMediaMuted" weight="700">
                {m.displayName}{' '}
              </Text>
              {m.text}
            </Text>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
  if (!overlay) return list;
  // Anchored at the bottom: fixed height so the newest messages sit right above the composer.
  return <TopFade style={{ height: maxHeight }}>{list}</TopFade>;
}

type ComposerProps = {
  onSend: (text: string) => void;
  onGift: () => void;
};

/** Send box (appends locally only), gift button, and the honest helper line. */
export function ChatComposer({ onSend, onGift }: ComposerProps) {
  const { stage, spacing, radius } = useTheme();
  const [text, setText] = useState('');

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t.slice(0, 200));
    setText('');
  };

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="Say something kind"
          placeholderTextColor={stage.muted}
          returnKeyType="send"
          maxLength={200}
          accessibilityLabel="Chat message"
          style={[
            {
              flex: 1,
              minWidth: 0,
              height: 44,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: stage.border,
              backgroundColor: stage.control,
              color: stage.text,
              fontFamily: fontFamilyFor('500'),
              fontSize: 15,
            },
          ]}
        />
        <IconButton
          icon="send"
          label="Send message"
          onPress={submit}
          onMedia
          disabled={!text.trim()}
          size={20}
        />
        <IconButton icon="gift" label="Send a gift" onPress={onGift} onMedia size={22} />
      </View>
      <Text variant="caption" tone="onMediaMuted" style={{ paddingLeft: spacing.sm }}>
        Sending is off in preview
      </Text>
    </View>
  );
}
