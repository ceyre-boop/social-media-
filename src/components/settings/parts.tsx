import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBar, Card, IconButton, Screen, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

/** A settings page: back arrow, title, scrolling column. Two levels deep at most. */
export function SettingsPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar
        title={title}
        left={
          <IconButton
            icon="chevron-back"
            label="Back to settings"
            onPress={() => router.navigate('/settings')}
          />
        }
      />
      <Screen title={title} scroll padded safeBottom={false} clearNav>
        {intro ? (
          <Text tone="secondary" variant="callout">
            {intro}
          </Text>
        ) : null}
        {children}
      </Screen>
    </View>
  );
}

/** A titled block of rows. Destructive groups pass `tone="danger"`. */
export function Group({
  title,
  note,
  children,
}: {
  title?: string;
  note?: string;
  children: React.ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Card padded={false} elevation={0}>
        {children}
      </Card>
      {note ? (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

/** One row: a title, one line saying what it does, and whatever sits on the right. */
export function Row({
  title,
  explain,
  right,
  onPress,
  first,
  tone,
  accessibilityState,
  role,
}: {
  title: string;
  explain?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  tone?: 'danger';
  accessibilityState?: { checked?: boolean; disabled?: boolean };
  role?: 'button' | 'radio' | 'switch' | 'link';
}) {
  const { colors, spacing } = useTheme();
  const body = (
    <View style={[styles.row, { padding: spacing.lg, gap: spacing.md }]}>
      <View style={styles.rowText}>
        <Text weight="600" tone={tone === 'danger' ? 'danger' : 'default'}>
          {title}
        </Text>
        {explain ? (
          <Text variant="callout" tone="secondary">
            {explain}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  return (
    <>
      {first ? null : <Divider />}
      {onPress ? (
        <Pressable
          accessibilityRole={role ?? 'button'}
          accessibilityLabel={title}
          accessibilityState={accessibilityState}
          aria-checked={accessibilityState?.checked}
          onPress={onPress}
          style={(s) => {
            const hovered = (s as { hovered?: boolean }).hovered;
            return [
              { minHeight: 56, cursor: 'pointer' },
              (hovered || s.pressed) && { backgroundColor: colors.surface2 },
            ];
          }}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </>
  );
}

export function LinkRow({
  title,
  explain,
  onPress,
  first,
  value,
}: {
  title: string;
  explain?: string;
  onPress: () => void;
  first?: boolean;
  value?: string;
}) {
  const { colors } = useTheme();
  return (
    <Row
      title={title}
      explain={explain}
      onPress={onPress}
      first={first}
      role="link"
      right={
        <View style={styles.chev}>
          {value ? (
            <Text variant="callout" tone="secondary">
              {value}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      }
    />
  );
}

/** A neutral on/off switch (no accent colour: toggles are quiet). */
export function Toggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.text : colors.surface3,
          borderColor: value ? colors.text : colors.borderStrong,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: value ? colors.bg : colors.muted,
            alignSelf: value ? 'flex-end' : 'flex-start',
          },
        ]}
      />
    </Pressable>
  );
}

export function ToggleRow({
  title,
  explain,
  value,
  onChange,
  first,
  disabled,
}: {
  title: string;
  explain: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
  disabled?: boolean;
}) {
  return (
    <Row
      title={title}
      explain={explain}
      first={first}
      right={<Toggle value={value} onChange={onChange} label={title} disabled={disabled} />}
    />
  );
}

export type Choice<T extends string> = { value: T; label: string; explain: string };

/** Pick one of a few, each with a plain sentence. The chosen one gets a tick, not a colour. */
export function ChoiceGroup<T extends string>({
  title,
  note,
  options,
  value,
  onChange,
}: {
  title?: string;
  note?: string;
  options: Choice<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <Group title={title} note={note}>
      {options.map((o, i) => (
        <Row
          key={o.value}
          first={i === 0}
          title={o.label}
          explain={o.explain}
          role="radio"
          accessibilityState={{ checked: o.value === value }}
          onPress={() => onChange(o.value)}
          right={
            o.value === value ? (
              <Ionicons name="checkmark" size={22} color={colors.text} />
            ) : (
              <View style={{ width: 22 }} />
            )
          }
        />
      ))}
    </Group>
  );
}

/** A time you step earlier/later in half hours, shown in words. */
export function TimeStepper({
  title,
  explain,
  display,
  onStep,
  first,
  canEarlier = true,
  canLater = true,
}: {
  title: string;
  explain?: string;
  display: string;
  onStep: (steps: number) => void;
  first?: boolean;
  canEarlier?: boolean;
  canLater?: boolean;
}) {
  return (
    <Row
      title={title}
      explain={explain}
      first={first}
      right={
        <View style={styles.stepper}>
          <IconButton
            icon="remove-circle-outline"
            label={`${title}: earlier`}
            disabled={!canEarlier}
            onPress={() => onStep(-1)}
          />
          <Text weight="600" style={styles.time} accessibilityLiveRegion="polite">
            {display}
          </Text>
          <IconButton
            icon="add-circle-outline"
            label={`${title}: later`}
            disabled={!canLater}
            onPress={() => onStep(1)}
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, gap: 2 },
  chev: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: {
    width: 52,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  thumb: { width: 24, height: 24, borderRadius: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  time: { minWidth: 78, textAlign: 'center' },
});
