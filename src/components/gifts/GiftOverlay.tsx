/**
 * The gift render layer for the live viewer. It owns the Mode A rail, and runs Anchor, Stage
 * and Takeover one at a time through the pure scheduler in ./queue (value-ordered, nothing
 * preempts, depth 8, 70% window cap, one takeover per minute). Rendered inside the video
 * area, below the header, chat and composer in z-order so those always stay reachable.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useReducedMotion } from '@/lib/theme';

import type { AnchorFeed } from './anchor/useAnchorFeed';
import { AnchorGift } from './AnchorGift';
import type { Gift } from './catalog';
import { GIFT_DEBUG, GiftDebugOverlay } from './GiftDebugOverlay';
import { motionScale, resolveMode } from './motionMode';
import type { GiftMotion } from './motionMode';
import { emptySched, enqueue, finish, nextWakeAt, pump } from './queue';
import type { SchedItem, SchedOut } from './queue';
import { RailCards } from './RailCards';
import { addToRail, emptyRail, expireRail, nextRailExpiry } from './rail';
import type { GiftSender } from './rail';
import { StageGift } from './StageGift';
import { TakeoverGift } from './TakeoverGift';
import { useGiftStage } from './stageLayout';

export type GiftOverlayHandle = {
  play: (gift: Gift, sender: GiftSender) => void;
  /** Drop everything (queue, playing gift, rail). */
  clear: () => void;
};

type Props = {
  ref?: Ref<GiftOverlayHandle>;
  motion: GiftMotion;
  /** Host "cap incoming animation size" (preview stub). */
  hostCap: boolean;
  feed: AnchorFeed;
};

type Payload = { gift: Gift; sender: GiftSender; lane: 'anchor' | 'stage' | 'takeover' };

/** Rail cards last at most this long, however long the gift's own animation would have been. */
const RAIL_MAX_MS = 2000;
/** A Takeover shown as a Stage (Calm) uses the top Stage band. */
const TAKEOVER_AS_STAGE = { fill: 90, ms: 4000 } as const;

export function GiftOverlay({ ref, motion, hostCap, feed }: Props) {
  const reduce = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stage = useGiftStage(size);

  const [rail, setRail] = useState(emptyRail);
  const [playing, setPlaying] = useState<({ id: number } & Payload) | null>(null);

  const sched = useRef(emptySched);
  const payloads = useRef(new Map<number, Payload>());
  const nextId = useRef(1);
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRef = useRef(motion);
  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);
  const wakeRun = useRef<() => void>(() => undefined);

  const pushRail = useCallback((gift: Gift, sender: GiftSender, full: boolean) => {
    setRail((r) =>
      addToRail(
        r,
        {
          giftId: gift.id,
          sender,
          durationMs: Math.min(gift.durationMs, RAIL_MAX_MS),
          puff: gift.tier === 'sparks',
          full,
        },
        Date.now(),
      ),
    );
  }, []);

  const apply = useCallback(
    (out: SchedOut) => {
      sched.current = out.state;
      for (const item of out.rail) {
        const pl = payloads.current.get(item.id);
        if (pl) pushRail(pl.gift, pl.sender, false);
        payloads.current.delete(item.id);
      }
      if (out.start) {
        const pl = payloads.current.get(out.start.id);
        if (pl) setPlaying({ id: out.start.id, ...pl });
      }
      if (wake.current) clearTimeout(wake.current);
      wake.current = null;
      const at = nextWakeAt(out.state, Date.now());
      if (at !== null) {
        wake.current = setTimeout(() => wakeRun.current(), at - Date.now() + 20);
      }
    },
    [pushRail],
  );

  useEffect(() => {
    wakeRun.current = () => apply(pump(sched.current, Date.now()));
  }, [apply]);

  const onFinish = useCallback(
    (id: number) => {
      payloads.current.delete(id);
      setPlaying((cur) => (cur?.id === id ? null : cur));
      apply(finish(sched.current, id, Date.now()));
    },
    [apply],
  );

  const onDegrade = useCallback(
    (id: number) => {
      const pl = payloads.current.get(id);
      if (pl) pushRail(pl.gift, pl.sender, true);
      onFinish(id);
    },
    [onFinish, pushRail],
  );

  useImperativeHandle(
    ref,
    () => ({
      play: (gift, sender) => {
        const mode = resolveMode(gift.renderMode, motionRef.current);
        if (mode === 'rail') {
          pushRail(gift, sender, false);
          return;
        }
        const id = nextId.current++;
        payloads.current.set(id, { gift, sender, lane: mode });
        const item: SchedItem = {
          id,
          lane: mode,
          blips: gift.blips,
          durationMs:
            mode === 'stage' && gift.renderMode === 'takeover'
              ? TAKEOVER_AS_STAGE.ms
              : gift.durationMs,
        };
        apply(enqueue(sched.current, item, Date.now()));
      },
      clear: () => {
        sched.current = emptySched;
        payloads.current.clear();
        if (wake.current) clearTimeout(wake.current);
        setPlaying(null);
        setRail(emptyRail);
      },
    }),
    [apply, pushRail],
  );

  // Rail cards leave on their own clock.
  useEffect(() => {
    const next = nextRailExpiry(rail);
    if (next === null) return;
    const id = setTimeout(
      () => setRail((r) => expireRail(r, Date.now())),
      Math.max(0, next - Date.now()) + 20,
    );
    return () => clearTimeout(id);
  }, [rail]);

  useEffect(
    () => () => {
      if (wake.current) clearTimeout(wake.current);
    },
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const scale = motionScale(motion, hostCap);
  const particles = motion === 'full' && !reduce;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      onLayout={onLayout}
    >
      {size.w > 0 ? (
        <>
          {GIFT_DEBUG ? <GiftDebugOverlay stage={stage} /> : null}
          {playing ? (
            playing.lane === 'anchor' ? (
              <AnchorGift
                key={playing.id}
                gift={playing.gift}
                senderName={playing.sender.name}
                stage={stage}
                feed={feed}
                scale={scale}
                fadeOnly={reduce}
                onDone={() => onFinish(playing.id)}
                onDegrade={() => onDegrade(playing.id)}
              />
            ) : playing.lane === 'stage' ? (
              <StageGift
                key={playing.id}
                gift={playing.gift}
                senderName={playing.sender.name}
                stage={stage}
                scale={scale}
                particles={particles}
                fadeOnly={reduce}
                fillPct={
                  playing.gift.renderMode === 'takeover' ? TAKEOVER_AS_STAGE.fill : undefined
                }
                durationMs={
                  playing.gift.renderMode === 'takeover'
                    ? TAKEOVER_AS_STAGE.ms
                    : playing.gift.durationMs
                }
                onDone={() => onFinish(playing.id)}
              />
            ) : (
              <TakeoverGift
                key={playing.id}
                gift={playing.gift}
                sender={playing.sender}
                stage={stage}
                fadeOnly={reduce}
                onDone={() => onFinish(playing.id)}
              />
            )
          ) : null}
          <RailCards cards={rail.cards} stage={stage} particles={particles} fadeOnly={reduce} />
        </>
      ) : null}
    </View>
  );
}
