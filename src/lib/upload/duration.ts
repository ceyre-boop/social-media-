export type VideoMetadata = { durationMs: number; width: number; height: number };

/** Native pickers and the recorder supply duration and size, so native never reads metadata here. */
export async function readVideoMetadata(_uri: string): Promise<VideoMetadata> {
  throw new Error('Video metadata is supplied by the native picker');
}
