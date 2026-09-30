import { useCallback, useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { easings } from '@/lib/motion';
import { useReducedMotion, useTheme } from '@/lib/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

/** At or above this width the sheet becomes a centered dialog. */
export const DIALOG_MIN_WIDTH = 768;

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Content may exceed the max height: wrap it in a ScrollView (drag then starts on the header). */
  scroll?: boolean;
};

/**
 * Bottom sheet on phones (drag to dismiss, backdrop, sized to its content, safe-area and
 * keyboard aware); centered modal dialog from 768px up. Reduced motion: fades only.
 */
export function Sheet(props: Props) {
  const [mounted, setMounted] = useState(props.visible);
  if (props.visible && !mounted) setMounted(true);
  if (!mounted) return null;
  return <SheetPanel {...props} onExited={() => setMounted(false)} />;
}

function SheetPanel({
  visible,
  onClose,
  onExited,
  title,
  children,
  scroll,
}: Props & { onExited: () => void }) {
  const { colors, radius, spacing, elevation, motion } = useTheme();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const desktop = win.width >= DIALOG_MIN_WIDTH;

  const [keyboard, setKeyboard] = useState(0);
  const sheetH = useSharedValue(0);
  const ty = useSharedValue(reduce || desktop ? 0 : win.height);
  const progress = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboard(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboard(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Open once on mount.
  useEffect(() => {
    progress.set(
      withTiming(1, {
        duration: reduce ? motion.duration.quick : motion.duration.base,
        easing: easings.standard,
      }),
    );
    if (!reduce && !desktop) ty.set(withSpring(0, motion.spring.gentle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (notify: boolean) => {
      onExited();
      if (notify) onClose();
    },
    [onExited, onClose],
  );

  const animateOut = useCallback(
    (notify: boolean) => {
      progress.set(withTiming(0, { duration: motion.duration.quick, easing: easings.standard }));
      const done = (ok?: boolean) => {
        'worklet';
        if (ok !== false) scheduleOnRN(finish, notify);
      };
      if (reduce || desktop) {
        ty.set(withTiming(0, { duration: motion.duration.quick }, done));
      } else {
        ty.set(
          withTiming(
            Math.max(sheetH.get(), 1) + 40,
            { duration: motion.duration.base, easing: easings.emphasized },
            done,
          ),
        );
      }
    },
    [reduce, desktop, progress, ty, sheetH, finish, motion],
  );

  // The parent hid the sheet: play the exit, then unmount (no onClose echo).
  useEffect(() => {
    if (!visible) animateOut(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = useCallback(() => animateOut(true), [animateOut]);

  const pan = Gesture.Pan()
    .enabled(!desktop)
    .activeOffsetY([-1000, 10])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      ty.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (ty.get() > sheetH.get() * 0.3 || e.velocityY > 900) {
        ty.set(
          withTiming(
            Math.max(sheetH.get(), 1) + 40,
            { duration: motion.duration.quick, easing: easings.emphasized },
            (ok) => {
              if (ok !== false) scheduleOnRN(finish, true);
            },
          ),
        );
        progress.set(withTiming(0, { duration: motion.duration.quick }));
      } else {
        ty.set(withSpring(0, motion.spring.gentle));
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    if (desktop || reduce) return { opacity: progress.get() };
    return { opacity: interpolate(ty.get(), [0, Math.max(sheetH.get(), 1)], [1, 0], 'clamp') };
  });

  const sheetStyle = useAnimatedStyle(() => {
    if (desktop) {
      return {
        opacity: progress.get(),
        transform: [{ scale: reduce ? 1 : interpolate(progress.get(), [0, 1], [0.96, 1]) }],
      };
    }
    if (reduce) return { opacity: progress.get(), transform: [{ translateY: ty.get() }] };
    return { transform: [{ translateY: ty.get() }] };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    sheetH.set(e.nativeEvent.layout.height);
  };

  const bottomPad = Math.max(insets.bottom, keyboard) + spacing.lg;

  const header = desktop ? (
    <View style={[styles.dialogHeader, { gap: spacing.md }]}>
      <Text variant="headline" style={styles.flex} accessibilityRole="header">
        {title ?? ''}
      </Text>
      <IconButton icon="close" label="Close" onPress={dismiss} />
    </View>
  ) : (
    <View style={{ alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={dismiss}
        hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
        style={{
          width: 40,
          height: 4,
          borderRadius: radius.pill,
          backgroundColor: colors.borderStrong,
        }}
      />
      {title ? (
        <Text
          variant="headline"
          accessibilityRole="header"
          style={{ alignSelf: 'stretch', paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flexShrink}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: bottomPad }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={{
        paddingHorizontal: desktop ? spacing.xxl : spacing.xl,
        paddingBottom: desktop ? spacing.xxl : bottomPad,
      }}
    >
      {children}
    </View>
  );

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  };

  const panel = desktop ? (
    <Animated.View
      onLayout={onLayout}
      accessibilityViewIsModal
      accessibilityLabel={title}
      style={[
        surface,
        elevation[3],
        sheetStyle,
        {
          width: '100%',
          maxWidth: 480,
          maxHeight: win.height * 0.85,
          borderRadius: radius.xl,
          paddingTop: spacing.lg,
        },
      ]}
    >
      <View style={{ paddingHorizontal: spacing.xxl, paddingBottom: spacing.md }}>{header}</View>
      {body}
    </Animated.View>
  ) : scroll ? (
    <Animated.View
      onLayout={onLayout}
      accessibilityViewIsModal
      accessibilityLabel={title}
      style={[
        surface,
        elevation[3],
        sheetStyle,
        styles.phoneSheet,
        {
          maxHeight: win.height - insets.top - spacing.xxl,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
        },
      ]}
    >
      <GestureDetector gesture={pan}>
        <View>{header}</View>
      </GestureDetector>
      {body}
    </Animated.View>
  ) : (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onLayout}
        accessibilityViewIsModal
        accessibilityLabel={title}
        style={[
          surface,
          elevation[3],
          sheetStyle,
          styles.phoneSheet,
          {
            maxHeight: win.height - insets.top - spacing.xxl,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
          },
        ]}
      >
        {header}
        {body}
      </Animated.View>
    </GestureDetector>
  );

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.flex}>
        <View
          style={[
            styles.flex,
            desktop
              ? { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }
              : { justifyContent: 'flex-end' },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, backdropStyle]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={dismiss}
            style={StyleSheet.absoluteFill}
          />
          {panel}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  phoneSheet: { width: '100%', overflow: 'hidden' },
  dialogHeader: { flexDirection: 'row', alignItems: 'center' },
});
