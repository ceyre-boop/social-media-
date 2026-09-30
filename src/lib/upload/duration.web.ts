export type VideoMetadata = { durationMs: number; width: number; height: number };

/** Reads metadata through a detached video element; callers give the friendly failure copy. */
export async function readVideoMetadata(uri: string): Promise<VideoMetadata> {
  return await new Promise<VideoMetadata>((resolve, reject) => {
    const video = document.createElement('video');
    const timeout = setTimeout(() => finish(new Error('Timed out reading video')), 10_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', failed);
      video.removeAttribute('src');
      video.load();
      if (error) reject(error);
    };
    const loaded = () => {
      const durationMs = Math.round(video.duration * 1000);
      const width = video.videoWidth;
      const height = video.videoHeight;
      finish();
      resolve({ durationMs, width, height });
    };
    const failed = () => finish(new Error('Could not read video'));
    video.preload = 'metadata';
    video.src = uri;
    video.addEventListener('loadedmetadata', loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}
