import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBreakpoint } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

type ToastOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; default 4500. */
  duration?: number;
};

type ToastApi = { show: (t: ToastOptions) => void };

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/** Non-blocking snackbar for recoverable errors. Sits above the tab bar on compact. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const compact = useBreakpoint() === 'compact';
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((t: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setToast({ ...t, id: counter.current });
    timer.current = setTimeout(() => setToast(null), t.duration ?? 4500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, { bottom: insets.bottom + (compact ? 72 : spacing.xl) }]}
        >
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              {
                backgroundColor: colors.surface2,
                borderColor: colors.border,
                borderRadius: radius.md,
              },
            ]}
          >
            <Text style={[styles.text, { color: colors.text }]}>{toast.message}</Text>
            {toast.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  dismiss();
                  toast.onAction?.();
                }}
                style={styles.action}
              >
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 480,
    width: '100%',
    paddingLeft: 16,
    paddingVertical: 4,
    borderWidth: 1,
  },
  text: { flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 10 },
  action: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    cursor: 'pointer',
  },
});
