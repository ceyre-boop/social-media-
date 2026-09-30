import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

const FRAME_BUDGET_MS = 1000 / 60;
const REPORT_INTERVAL_MS = 500;

export const PERF_OVERLAY_ENABLED = process.env.EXPO_PUBLIC_PERF_OVERLAY === '1';

type PerfStats = {
  jsFps: number;
  uiFps: number;
  jsDropped: number;
  uiDropped: number;
};

function droppedFrames(deltaMs: number): number {
  return deltaMs > FRAME_BUDGET_MS * 1.5 ? Math.floor(deltaMs / FRAME_BUDGET_MS) - 1 : 0;
}

/** A development-only frame-rate monitor for the reel player. */
export function PerfOverlay() {
  if (!PERF_OVERLAY_ENABLED) return null;
  return <EnabledPerfOverlay />;
}

function EnabledPerfOverlay() {
  const { stage, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<PerfStats>({ jsFps: 0, uiFps: 0, jsDropped: 0, uiDropped: 0 });
  const jsFrameCount = useRef(0);
  const jsDropped = useRef(0);
  const jsLastFrame = useRef<number | null>(null);
  const jsLastReport = useRef<number | null>(null);

  const uiFrameCount = useSharedValue(0);
  const uiDropped = useSharedValue(0);
  const uiLastFrame = useSharedValue(0);
  const uiLastReport = useSharedValue(0);

  const reportUi = useCallback((uiFps: number, dropped: number) => {
    setStats((current) => ({ ...current, uiFps: Math.round(uiFps), uiDropped: dropped }));
  }, []);

  useFrameCallback((frame) => {
    'worklet';
    const timestamp = frame.timestamp;
    if (uiLastFrame.get() > 0) {
      uiDropped.set(uiDropped.get() + droppedFrames(timestamp - uiLastFrame.get()));
    }
    uiLastFrame.set(timestamp);
    uiFrameCount.set(uiFrameCount.get() + 1);

    if (uiLastReport.get() === 0) uiLastReport.set(timestamp);
    const elapsed = timestamp - uiLastReport.get();
    if (elapsed >= REPORT_INTERVAL_MS) {
      scheduleOnRN(reportUi, (uiFrameCount.get() * 1000) / elapsed, uiDropped.get());
      uiFrameCount.set(0);
      uiLastReport.set(timestamp);
    }
  });

  useEffect(() => {
    let animationFrame = 0;
    const onFrame = (timestamp: number) => {
      if (jsLastFrame.current !== null) {
        jsDropped.current += droppedFrames(timestamp - jsLastFrame.current);
      }
      jsLastFrame.current = timestamp;
      jsFrameCount.current += 1;

      if (jsLastReport.current === null) jsLastReport.current = timestamp;
      const elapsed = timestamp - jsLastReport.current;
      if (elapsed >= REPORT_INTERVAL_MS) {
        const jsFps = (jsFrameCount.current * 1000) / elapsed;
        setStats((current) => ({
          ...current,
          jsFps: Math.round(jsFps),
          jsDropped: jsDropped.current,
        }));
        jsFrameCount.current = 0;
        jsLastReport.current = timestamp;
      }
      animationFrame = requestAnimationFrame(onFrame);
    };

    animationFrame = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const reset = useCallback(() => {
    jsFrameCount.current = 0;
    jsDropped.current = 0;
    jsLastFrame.current = null;
    jsLastReport.current = null;
    uiFrameCount.set(0);
    uiDropped.set(0);
    uiLastFrame.set(0);
    uiLastReport.set(0);
    setStats({ jsFps: 0, uiFps: 0, jsDropped: 0, uiDropped: 0 });
  }, [uiDropped, uiFrameCount, uiLastFrame, uiLastReport]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + spacing.sm, right: spacing.sm }]}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.panel,
          { backgroundColor: stage.control, borderRadius: radius.sm, gap: spacing.xs },
        ]}
      >
        <Text pointerEvents="none" variant="micro" tone="onMedia" style={styles.metric}>
          JS {stats.jsFps} FPS · {stats.jsDropped} DROP
        </Text>
        <Text pointerEvents="none" variant="micro" tone="onMedia" style={styles.metric}>
          UI {stats.uiFps} FPS · {stats.uiDropped} DROP
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset performance counters"
          onPress={reset}
          style={({ pressed }) => [
            styles.reset,
            { backgroundColor: pressed ? stage.controlHover : stage.control },
          ]}
        >
          <Text pointerEvents="none" variant="micro" tone="onMedia" style={styles.metric}>
            Reset
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 1000 },
  panel: { padding: 6, alignItems: 'flex-end' },
  metric: { fontFamily: 'monospace', fontVariant: ['tabular-nums'], letterSpacing: 0 },
  reset: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
});
