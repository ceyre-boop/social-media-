import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

import { PageTitle } from './PageTitle';

type Props = {
  children: React.ReactNode;
  /** Document title on web. */
  title: string;
  /** Wrap content in a ScrollView (forms). */
  scroll?: boolean;
  /** Center content and cap its width (auth cards use 420). */
  maxWidth?: number;
  /** Pad for the device top/bottom inset (screens without an AppBar / tab bar). */
  safeTop?: boolean;
  safeBottom?: boolean;
  /** Vertically center content (auth). */
  center?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Page container: background, safe areas, keyboard handling, max-width column. */
export function Screen({
  children,
  title,
  scroll,
  maxWidth,
  safeTop,
  safeBottom,
  center,
  padded,
  contentStyle,
}: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? spacing.lg : 0;

  const inner: StyleProp<ViewStyle> = [
    {
      width: '100%',
      maxWidth,
      alignSelf: 'center',
      padding: pad,
      paddingTop: pad + (safeTop ? insets.top : 0),
      paddingBottom: pad + (safeBottom ? insets.bottom : 0),
      gap: padded ? spacing.lg : 0,
    },
    !scroll && { flex: 1 },
    contentStyle,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title={title} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: center ? 'center' : 'flex-start',
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={inner}>{children}</View>
          </ScrollView>
        ) : (
          <View style={inner}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
