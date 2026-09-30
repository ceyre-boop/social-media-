import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/lib/theme';

import { Button } from './Button';
import { LogoMark } from './Logo';
import { Text } from './Text';

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Illustration slot. Defaults to the logo badge; pass `null` for none. */
  illustration?: ReactNode;
  /** Use the smaller `title` step for error-ish states with long copy. */
  compact?: boolean;
};

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  illustration,
  compact,
}: Props) {
  const { spacing } = useTheme();
  const art = illustration === undefined ? <LogoMark size={88} /> : illustration;
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxxl,
        gap: spacing.lg,
      }}
    >
      {art}
      <Text variant={compact ? 'title' : 'display'} align="center">
        {title}
      </Text>
      {message ? (
        <Text tone="secondary" align="center" style={{ maxWidth: 360 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}
