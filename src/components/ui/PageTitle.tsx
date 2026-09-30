import Head from 'expo-router/head';
import { Platform } from 'react-native';
import { pageTitle } from '@/config/brand';

/** Sets the document title on web ("Feed · AppName"). No-op on native. */
export function PageTitle({ title }: { title: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Head>
      <title>{pageTitle(title)}</title>
    </Head>
  );
}
