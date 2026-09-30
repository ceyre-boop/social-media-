import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, Share } from 'react-native';

import type { FeedPost } from '@/lib/posts';

/** Copy text to the clipboard (web and native). */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

export type NativeShareResult = 'shared' | 'copied' | 'dismissed';

/**
 * The system share sheet: navigator.share on the web (falls back to copying the link where it
 * does not exist, e.g. desktop Firefox), Share.share on iOS and Android.
 */
export async function shareNative(args: { url: string; text: string }): Promise<NativeShareResult> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: args.text, url: args.url });
        return 'shared';
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'dismissed';
        // Any other failure (permissions, unsupported data): fall through to copy.
      }
    }
    await copyText(args.url);
    return 'copied';
  }
  const res = await Share.share({ message: `${args.text}\n${args.url}`, url: args.url });
  return res.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

/** Open an intent URL: http(s) in a new tab on web, everything else via the OS. */
export function openExternal(url: string): void {
  if (Platform.OS === 'web') {
    if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
    return;
  }
  void Linking.openURL(url);
}

/** Respect creators: your own posts, or public ones. A per-post "allow downloads" setting comes later. */
export function canSaveVideo(post: FeedPost, me: string | null): boolean {
  return !!post.videoUrl && (post.author_id === me || post.visibility === 'public');
}

function fileNameFor(post: FeedPost): string {
  return `${post.author?.username ?? 'video'}-${post.id.slice(0, 8)}.mp4`;
}

/**
 * Save the reel to the device. Web downloads the file; native downloads to the cache and adds it
 * to the photo library (write-only permission). Throws a short message-bearing Error on failure.
 */
export async function saveVideo(post: FeedPost): Promise<void> {
  const url = post.videoUrl;
  if (!url) throw new Error('This video is not available to save.');
  const name = fileNameFor(post);

  if (Platform.OS === 'web') {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not download the video.');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return;
  }

  // Loaded on demand: expo-media-library's web build extends classes that do not exist there,
  // so importing it at module load would break the web bundle and static render.
  const [MediaLibrary, { File, Paths }] = await Promise.all([
    import('expo-media-library'),
    import('expo-file-system'),
  ]);
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('Allow photo access in Settings to save videos.');
  const file = await File.downloadFileAsync(url, new File(Paths.cache, name));
  await MediaLibrary.Asset.create(file.uri);
}
