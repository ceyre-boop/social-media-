import Head from 'expo-router/head';
import { Platform } from 'react-native';

/** Sets the document title on web ("Feed · Smiley"). No-op on native. */
export function PageTitle({ title }: { title: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <Head>
      <title>{title === 'Smiley' ? title : `${title} · Smiley`}</title>
    </Head>
  );
}
