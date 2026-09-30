import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '@/lib/layout';
import { easings } from '@/lib/motion';
import { useReducedMotion, useTheme } from '@/lib/theme';

import { Text } from './Text';

type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; default 4500. */
  duration?: number;
  tone?: 'neutral' | 'success' | 'danger';
};

type ToastApi = { show: (t: ToastOptions) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

const MAX_STACK = 3;

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

type Item = ToastOptions & { id: number };

function ToastCard({ toast, onDismiss }: { toast: Item; onDismiss: (id: number) => void }) {
  const { colors, radius, spacing, elevation, motion } = useTheme();
  const reduce = useReducedMotion();
  const icon =
    toast.tone === 'success'
      ? ({ name: 'checkmark-circle', color: colors.success } as const)
      : toast.tone === 'danger'
        ? ({ name: 'alert-circle', color: colors.danger } as const)
        : null;

  // Reduced motion: fades only, no translation.
  const entering = reduce
    ? FadeIn.duration(motion.duration.quick)
    : FadeInDown.duration(motion.duration.base).easing(easings.standard);
  const exiting = FadeOut.duration(motion.duration.quick);

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      layout={reduce ? undefined : LinearTransition.duration(motion.duration.base)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        elevation[3],
        {
          backgroundColor: colors.surface2,
          borderColor: colors.borderStrong,
          borderRadius: radius.md,
          paddingLeft: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      {icon ? <Ionicons name={icon.name} size={20} color={icon.color} /> : null}
      <Text variant="caption" weight="600" style={styles.text}>
        {toast.message}
      </Text>
      {toast.actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDismiss(toast.id);
            toast.onAction?.();
          }}
          style={styles.action}
        >
          <Text variant="callout" weight="800" tone="primary">
            {toast.actionLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => onDismiss(toast.id)}
          style={styles.action}
        >
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      )}
    </Animated.View>
  );
}

/** Non-blocking, stacked snackbars (max 3). Sits above the tab bar on compact. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const compact = useBreakpoint() === 'compact';
  const [toasts, setToasts] = useState<Item[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastOptions) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => {
        const next = [...prev, { ...t, id }];
        // Oldest falls off the top of the stack.
        for (const old of next.slice(0, Math.max(0, next.length - MAX_STACK))) {
          const timer = timers.current.get(old.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(old.id);
        }
        return next.slice(-MAX_STACK);
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), t.duration ?? 4500),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          { bottom: insets.bottom + (compact ? 96 : spacing.xxl), gap: spacing.sm },
        ]}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
    paddingVertical: 4,
    borderWidth: 1,
  },
  text: { flex: 1, paddingVertical: 10 },
  action: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    cursor: 'pointer',
  },
});
