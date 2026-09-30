import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEMO_STEPS,
  GiftOverlay,
  GiftPicker,
  findGift,
  useAnchorFeed,
  useGiftMotion,
} from '@/components/gifts';
import type { Gift, GiftOverlayHandle, GiftSender } from '@/components/gifts';
import { ChatComposer, ChatList } from '@/components/live/ChatPanel';
import type { ChatEntry } from '@/components/live/ChatPanel';
import { LiveChip } from '@/components/live/LiveChip';
import { ParticipantsSheet } from '@/components/live/ParticipantsSheet';
import { VideoPlaceholder } from '@/components/live/VideoPlaceholder';
import { ViewerOptionsSheet } from '@/components/live/ViewerOptionsSheet';
import { Avatar, EmptyState, IconButton, PageTitle, Text } from '@/components/ui';
import { formatViewers } from '@/lib/live/format';
import { STUB_CHAT, STUB_INCOMING, findStream, participantsFor } from '@/lib/live/stub';
import { useReducedMotion, useTheme } from '@/lib/theme';

const DESKTOP_MIN = 768;
const CHAT_COLUMN = 260;
/** Composer row (44) + helper line + paddings. */
const COMPOSER_HEIGHT = 76;
const YOU: GiftSender = { id: 'you', name: 'You', username: 'you' };

const seed: ChatEntry[] = STUB_CHAT.slice(0, 5).map((m) => ({ ...m, initial: true }));

/**
 * Live viewer shell. Always on the dark stage palette. Stub data only: chat sends append
 * locally, gifts play their animation and nothing else. No network.
 */
export default function LiveViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stage, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const reduce = useReducedMotion();
  const desktop = win.width >= DESKTOP_MIN;

  const stream = findStream(id);
  const [messages, setMessages] = useState<ChatEntry[]>(seed);
  const [people, setPeople] = useState(false);
  const [gifts, setGifts] = useState(false);
  const [options, setOptions] = useState(false);
  const [motion, setMotion] = useGiftMotion();
  const [hostCap, setHostCap] = useState(false);
  const feed = useAnchorFeed(reduce ? 0 : 1);
  const overlay = useRef<GiftOverlayHandle>(null);
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);

  // A few sample messages arrive once, a few seconds apart, so the chat feels alive.
  useEffect(() => {
    const timers = STUB_INCOMING.map((m, i) =>
      setTimeout(() => setMessages((cur) => [...cur, m]), 3500 * (i + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const timers = demoTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/live'));

  if (!stream) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: stage.bg }}>
        <PageTitle title="Live" />
        <EmptyState
          title="This stream has ended"
          message="Head back to see who else is live."
          actionLabel="Back to Live"
          onAction={() => router.navigate('/live')}
        />
      </View>
    );
  }

  const send = (text: string) => {
    const n = counter.current++;
    setMessages((cur) => [...cur, { id: `me-${n}`, username: 'you', displayName: 'You', text }]);
  };

  const sendGift = (gift: Gift) => {
    setGifts(false);
    overlay.current?.play(gift, YOU);
  };

  const tryGifts = () => {
    demoTimers.current.forEach(clearTimeout);
    overlay.current?.clear();
    demoTimers.current = DEMO_STEPS.map((step) =>
      setTimeout(() => {
        const gift = findGift(step.giftId);
        if (gift) overlay.current?.play(gift, step.sender);
      }, step.at + 300),
    );
  };

  const participants = participantsFor(stream);
  const topPad = desktop ? spacing.md : insets.top + spacing.sm;
  // The viewer is immersive (no floating nav): the composer sits on the bottom safe inset.
  const clearance = insets.bottom + spacing.sm;
  // Phone chat fills the bottom guard (72-100%) between the guard line and the composer, so
  // about four full messages fit above it.
  const composerTop = win.height - clearance - COMPOSER_HEIGHT;
  const chatHeight = Math.max(96, Math.min(220, composerTop - win.height * 0.72));

  const topBar = (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingTop: topPad,
        paddingHorizontal: spacing.sm,
      }}
    >
      <IconButton icon="chevron-back" label="Back to Live" onPress={back} onMedia />
      <Avatar username={stream.host.username} displayName={stream.host.displayName} size="sm" />
      <View style={{ flex: 1, minWidth: 0, marginLeft: spacing.xs }}>
        <Text variant="callout" tone="onMedia" numberOfLines={1}>
          {stream.host.displayName}
        </Text>
        <Text variant="caption" tone="onMediaMuted" numberOfLines={1}>
          {formatViewers(stream.viewerCount)}
        </Text>
      </View>
      <LiveChip />
      <IconButton icon="people" label="Participants" onPress={() => setPeople(true)} onMedia />
      <IconButton icon="options" label="Viewer options" onPress={() => setOptions(true)} onMedia />
    </View>
  );

  const composer = <ChatComposer onSend={send} onGift={() => setGifts(true)} />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: stage.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PageTitle title={stream.title} />
      <View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <VideoPlaceholder stream={stream} feed={feed} />
          {/* Gifts render above the video but below the header, chat and composer, so those
              always stay reachable. */}
          <GiftOverlay ref={overlay} motion={motion} hostCap={hostCap} feed={feed} />
          {topBar}
          {desktop ? null : (
            <View
              pointerEvents="box-none"
              style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: clearance }}
            >
              <View style={{ width: '72%' }}>
                <ChatList messages={messages} variant="overlay" maxHeight={chatHeight} />
              </View>
              {composer}
            </View>
          )}
        </View>
        {desktop ? (
          <View
            style={{
              width: CHAT_COLUMN,
              backgroundColor: stage.surface,
              borderLeftWidth: 1,
              borderLeftColor: stage.border,
              paddingBottom: spacing.md,
            }}
          >
            <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.lg }}>
              <Text variant="callout" tone="onMedia" accessibilityRole="header">
                Chat
              </Text>
            </View>
            <ChatList messages={messages} variant="column" />
            {composer}
          </View>
        ) : null}
      </View>

      <ParticipantsSheet
        visible={people}
        onClose={() => setPeople(false)}
        participants={participants}
      />
      <GiftPicker visible={gifts} onClose={() => setGifts(false)} onSelect={sendGift} />
      <ViewerOptionsSheet
        visible={options}
        onClose={() => setOptions(false)}
        motion={motion}
        onMotion={setMotion}
        hostCap={hostCap}
        onHostCap={setHostCap}
        onTryGifts={tryGifts}
      />
    </KeyboardAvoidingView>
  );
}
