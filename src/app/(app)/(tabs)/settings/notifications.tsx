import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  ChoiceGroup,
  Group,
  Row,
  SettingsPage,
  TimeStepper,
  ToggleRow,
} from '@/components/settings/parts';
import { Button, EmptyState, Sheet, Text, TextField, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_LABELS, type NotificationType } from '@/lib/push/copy';
import { fetchNotificationPrefs, setNotificationPref } from '@/lib/settings';
import { canStepWaking, formatTime, STEP_MINUTES, stepTime, toMinutes } from '@/lib/settings/time';
import {
  allTimezones,
  deviceTimezone,
  filterTimezones,
  timezoneLabel,
} from '@/lib/settings/timezones';
import { useUserSettings } from '@/lib/settings/useUserSettings';
import { useTheme } from '@/lib/theme';

const PER_DAY = [
  { value: 'auto', label: 'We choose', explain: 'One or two a day, picked at random.' },
  { value: '1', label: 'One a day', explain: 'At most one nudge a day.' },
  { value: '2', label: 'Two a day', explain: 'Up to two nudges a day.' },
] as const;

export default function Notifications() {
  const { session, handleError } = useAuth();
  const toast = useToast();
  const me = session!.user.id;
  const { settings, error, reload, save } = useUserSettings();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [tzOpen, setTzOpen] = useState(false);

  const loadPrefs = useCallback(() => {
    fetchNotificationPrefs()
      .then((rows) => setPrefs(Object.fromEntries(rows.map((r) => [r.type, r.enabled]))))
      .catch((e) =>
        toast.show({ message: handleError(e, 'notificationPrefs').message, tone: 'danger' }),
      );
  }, [handleError, toast]);
  useEffect(loadPrefs, [loadPrefs]);

  async function toggle(type: string, enabled: boolean) {
    setPrefs((p) => (p ? { ...p, [type]: enabled } : p));
    try {
      await setNotificationPref(me, type, enabled);
    } catch (e) {
      setPrefs((p) => (p ? { ...p, [type]: !enabled } : p));
      toast.show({ message: handleError(e, 'setNotificationPref').message, tone: 'danger' });
    }
  }

  const types = Object.keys(NOTIFICATION_LABELS) as NotificationType[];
  const ready = settings && prefs;

  return (
    <SettingsPage
      title="Notifications"
      intro="Choose what we tell you about. Turning one off never loses anything; it just stays quiet."
    >
      {error && !settings ? (
        <EmptyState
          compact
          title={error.title}
          message={error.message}
          actionLabel="Retry"
          onAction={reload}
        />
      ) : null}
      {ready ? (
        <>
          <Group title="What to tell me about">
            {types
              .filter((t) => t !== 'moment_prompt')
              .map((t, i) => (
                <ToggleRow
                  key={t}
                  first={i === 0}
                  title={NOTIFICATION_LABELS[t].label}
                  explain={NOTIFICATION_LABELS[t].explain}
                  value={prefs[t] ?? true}
                  onChange={(v) => toggle(t, v)}
                />
              ))}
          </Group>

          <Group
            title="Quiet hours"
            note={
              settings.quiet_start === settings.quiet_end
                ? 'No quiet hours right now.'
                : `Nothing buzzes your phone from ${formatTime(settings.quiet_start)} to ${formatTime(settings.quiet_end)}. What arrives then waits until the morning; nothing is lost.`
            }
          >
            <TimeStepper
              first
              title="Quiet from"
              display={formatTime(settings.quiet_start)}
              onStep={(n) => save({ quiet_start: stepTime(settings.quiet_start, n) })}
            />
            <TimeStepper
              title="Quiet until"
              display={formatTime(settings.quiet_end)}
              onStep={(n) => save({ quiet_end: stepTime(settings.quiet_end, n) })}
            />
          </Group>

          <Group
            title="Moment prompts"
            note="A Moment is a quick look at your day for your friends. These nudges only arrive between your earliest and latest times, and never in quiet hours."
          >
            <ToggleRow
              first
              title={NOTIFICATION_LABELS.moment_prompt.label}
              explain={NOTIFICATION_LABELS.moment_prompt.explain}
              value={prefs.moment_prompt ?? true}
              onChange={(v) => toggle('moment_prompt', v)}
            />
            <TimeStepper
              title="Earliest"
              display={formatTime(settings.waking_start)}
              canEarlier={toMinutes(settings.waking_start) >= STEP_MINUTES}
              canLater={canStepWaking(stepTime(settings.waking_start, 1), settings.waking_end)}
              onStep={(n) => save({ waking_start: stepTime(settings.waking_start, n) })}
            />
            <TimeStepper
              title="Latest"
              display={formatTime(settings.waking_end)}
              canLater={toMinutes(settings.waking_end) + STEP_MINUTES < 24 * 60}
              canEarlier={canStepWaking(settings.waking_start, stepTime(settings.waking_end, -1))}
              onStep={(n) => save({ waking_end: stepTime(settings.waking_end, n) })}
            />
          </Group>
          <ChoiceGroup
            title="How many prompts a day"
            options={[...PER_DAY]}
            value={String(settings.moment_prompts_per_day ?? 'auto') as 'auto' | '1' | '2'}
            onChange={(v) =>
              save({ moment_prompts_per_day: v === 'auto' ? null : (Number(v) as 1 | 2) })
            }
          />

          <Group title="Time zone" note="Quiet hours and prompts follow the clock where you are.">
            <Row
              first
              title="Your time zone"
              explain={timezoneLabel(settings.timezone)}
              role="button"
              onPress={() => setTzOpen(true)}
              right={<Text tone="secondary">Change</Text>}
            />
          </Group>

          <TimezoneSheet
            visible={tzOpen}
            current={settings.timezone}
            onClose={() => setTzOpen(false)}
            onPick={(tz) => {
              setTzOpen(false);
              void save({ timezone: tz });
            }}
          />
        </>
      ) : null}
    </SettingsPage>
  );
}

function TimezoneSheet({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: string;
  onClose: () => void;
  onPick: (tz: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const [q, setQ] = useState('');
  const all = useMemo(() => allTimezones(), []);
  const shown = useMemo(() => filterTimezones(all, q).slice(0, 60), [all, q]);
  const device = deviceTimezone();

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose your time zone" scroll>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {device ? (
          <Button
            title={`Use this device's time zone (${timezoneLabel(device)})`}
            variant="secondary"
            onPress={() => onPick(device)}
          />
        ) : null}
        <TextField
          label="Search"
          hint="Try a city or region, like London or Pacific"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {shown.length === 0 ? <Text tone="secondary">No matches.</Text> : null}
          {shown.map((tz) => (
            <Pressable
              key={tz}
              accessibilityRole="radio"
              accessibilityLabel={timezoneLabel(tz)}
              accessibilityState={{ checked: tz === current }}
              onPress={() => onPick(tz)}
              style={{
                minHeight: 48,
                justifyContent: 'center',
                paddingHorizontal: spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text weight={tz === current ? '700' : '400'}>
                {timezoneLabel(tz)}
                {tz === current ? '  (current)' : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Sheet>
  );
}
