/** Native yields a file uri, web yields an in-memory JPEG; exactly one is set. */
export type PosterResult = {
  uri: string | null;
  blob: Blob | null;
  width: number | null;
  height: number | null;
};

function waitForEvent(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      reject(new Error('Could not read video frame'));
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

/** Makes a small JPEG cover in the browser without bringing DOM globals into native bundles. */
export async function createPoster(uri: string): Promise<PosterResult> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = uri;
  await waitForEvent(video, 'loadedmetadata');
  const originalWidth = video.videoWidth;
  const originalHeight = video.videoHeight;
  if (!originalWidth || !originalHeight) throw new Error('Could not read video dimensions');
  video.currentTime = Math.min(0.1, Math.max(0, video.duration || 0));
  await waitForEvent(video, 'seeked');
  const scale = Math.min(1, 1280 / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create poster');
  context.drawImage(video, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  video.removeAttribute('src');
  video.load();
  if (!blob) throw new Error('Could not create poster');
  return { uri: null, blob, width: originalWidth, height: originalHeight };
}
