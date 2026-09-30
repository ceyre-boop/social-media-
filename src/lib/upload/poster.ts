import { getThumbnailAsync } from 'expo-video-thumbnails';

/** Native yields a file uri, web yields an in-memory JPEG; exactly one is set. */
export type PosterResult = {
  uri: string | null;
  blob: Blob | null;
  width: number | null;
  height: number | null;
};

/** Native thumbnail extraction stays in this platform file so web never imports it. */
export async function createPoster(uri: string): Promise<PosterResult> {
  const result = await getThumbnailAsync(uri, { time: 0, quality: 0.8 });
  return {
    uri: result.uri,
    blob: null,
    width: Number.isFinite(result.width) && result.width > 0 ? Math.round(result.width) : null,
    height: Number.isFinite(result.height) && result.height > 0 ? Math.round(result.height) : null,
  };
}
