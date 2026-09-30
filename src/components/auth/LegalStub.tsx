import { router } from 'expo-router';

import { Button, Screen, Text } from '@/components/ui';

/** Placeholder for legal pages. The real text lands later; do not write legal copy here. */
export function LegalStub({ title }: { title: string }) {
  return (
    <Screen title={title} center maxWidth={420} padded safeTop safeBottom>
      <Text accessibilityRole="header" variant="title" align="center">
        {title}
      </Text>
      <Text tone="secondary" align="center">
        Coming soon.
      </Text>
      <Button
        title="Back"
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}
