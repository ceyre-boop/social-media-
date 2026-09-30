import { useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
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

/** Chat messages with a gentle entry animation (fade only under reduced motion). */
export function ChatList({ messages, variant, maxHeight }: ListProps) {
  const { stage, spacing, radius, motion } = useTheme();
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const bubble = variant === 'overlay' ? stage.controlHover : stage.surface2;

  return (
    <ScrollView
      ref={scroller}
      style={variant === 'overlay' ? { maxHeight } : { flex: 1 }}
      contentContainerStyle={{
        gap: spacing.xs + 2,
        padding: spacing.md,
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
