import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { pushReachable } from '@/lib/push';
import { notificationCopy, type NotificationType } from '@/lib/push/copy';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const RECENT_DAYS = 7;

type Nudge = { id: number; kind: NotificationType; data: Record<string, unknown> };

/**
 * The in-app stand-in for push: shows the newest unread notification (of a type the person has
 * switched on) when push can't reach them — web, permission denied, or no EAS project yet.
 * Live via Realtime on the notifications table. Dismissing marks it read.
 */
export function InAppNudge() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius, elevation } = useTheme();
  const [nudge, setNudge] = useState<Nudge | null>(null);

  const load = useCallback(async () => {
    if (!uid || (await pushReachable())) return setNudge(null);
    const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
    const [prefs, rows] = await Promise.all([
      supabase.rpc('my_notification_prefs'),
      supabase
        .from('notifications')
        .select('id, kind, data')
        .is('read_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (prefs.error || rows.error) return; // keep whatever is showing; try again on the next event
    const on = new Set(prefs.data.filter((p) => p.enabled).map((p) => p.type as string));
    const next = rows.data.find((r) => on.has(r.kind));
    setNudge(
      next
        ? {
            id: next.id,
            kind: next.kind as NotificationType,
            data: (next.data ?? {}) as Record<string, unknown>,
          }
        : null,
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    // First load on the next tick (not synchronously inside the effect).
    const first = setTimeout(() => void load(), 0);
    const channel = supabase
      .channel(`nudge:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      clearTimeout(first);
      void supabase.removeChannel(channel);
    };
  }, [uid, load]);

  const dismiss = useCallback(async () => {
    if (!nudge) return;
    setNudge(null);
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', nudge.id);
    void load();
  }, [nudge, load]);

  if (!nudge) return null;
  const copy = notificationCopy(nudge.kind, nudge.data);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + spacing.sm, paddingHorizontal: spacing.md }]}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${copy.title}. ${copy.body}`}
        onPress={dismiss}
        style={[
          styles.card,
          elevation[2],
          {
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}
      >
        <View style={styles.text}>
          <Text variant="callout" weight="700">
            {copy.title}
          </Text>
          <Text variant="caption" tone="secondary">
            {copy.body}
          </Text>
        </View>
        <IconButton icon="close" label="Dismiss" size={18} onPress={dismiss} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 40, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 480,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
