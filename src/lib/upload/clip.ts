/**
 * Turns a picked or recorded video into a validated ReelDraft (duration, size, type, poster).
 * Every refusal is a ReelClipProblem whose message is safe to show as-is. No upload happens here.
 */
import { Platform } from 'react-native';

import { readVideoMetadata } from './duration';
import { createPoster } from './poster';
import type { ReelDraft } from './reel';

/** The server allows 30 500 ms (container tolerance); the product promise is 30 s. */
export const REEL_MAX_MS = 30_500;
export const REEL_MIN_MS = 1_000;
/** Matches the `media` bucket limit in migration 007 (60 MiB). */
export const REEL_MAX_BYTES = 60 * 1024 * 1024;

export const TOO_LONG_COPY = 'Trim it to 30 seconds in your gallery, then try again';

export class ReelClipProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReelClipProblem';
  }
}

/** What the picker or recorder hands over; any field may be missing depending on platform. */
export type ReelSource = {
  uri: string;
  /** Milliseconds, as reported by the picker (expo-image-picker) or the recorder clock. */
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  mimeType?: string | null;
  fileName?: string | null;
  /** Web only: the picked File, which carries size and type. */
  file?: Blob | null;
};

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function contentTypeOf(source: ReelSource): ReelDraft['contentType'] | null {
  const mime = (source.mimeType ?? source.file?.type ?? '').toLowerCase();
  if (mime === 'video/mp4') return 'video/mp4';
  if (mime === 'video/quicktime') return 'video/quicktime';
  const name = (source.fileName ?? source.uri).toLowerCase().split('?')[0];
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (mime) return null;
  // Native recordings and exports are MP4/MOV containers; an unlabelled file:// is one of those.
  return Platform.OS === 'web' ? null : Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4';
}

async function byteSize(source: ReelSource): Promise<number> {
  const known = positive(source.bytes) ?? positive(source.file?.size);
  if (known) return known;
  const response = await fetch(source.uri);
  if (!response.ok) throw new ReelClipProblem("We couldn't read that video. Try another one.");
  return (await response.blob()).size;
}

export function assertDurationAllowed(durationMs: number | null): number {
  if (durationMs === null) throw new ReelClipProblem("We couldn't read that video's length");
  if (durationMs > REEL_MAX_MS) throw new ReelClipProblem(TOO_LONG_COPY);
  if (durationMs < REEL_MIN_MS) {
    throw new ReelClipProblem('Reels need to be at least a second long.');
  }
  return durationMs;
}

export async function prepareReelDraft(source: ReelSource): Promise<ReelDraft> {
  const contentType = contentTypeOf(source);
  if (!contentType) throw new ReelClipProblem('Pick an MP4 or MOV video');

  let durationMs = positive(source.durationMs);
  let width = positive(source.width);
  let height = positive(source.height);
  if (Platform.OS === 'web') {
    // Browsers do not report duration through the picker; read it from the file itself.
    try {
      const meta = await readVideoMetadata(source.uri);
      durationMs = positive(meta.durationMs) ?? durationMs;
      width = positive(meta.width) ?? width;
      height = positive(meta.height) ?? height;
    } catch (error) {
      if (__DEV__) console.warn('reel metadata failed:', error);
      throw new ReelClipProblem("We couldn't read that video. Try an MP4 or MOV.");
    }
  }
  const allowedMs = assertDurationAllowed(durationMs);

  const bytes = await byteSize(source);
  if (bytes > REEL_MAX_BYTES) {
    throw new ReelClipProblem('That video is over 60 MB. Try a shorter clip.');
  }

  let posterUri: string | null = null;
  let posterBlob: Blob | null = null;
  try {
    const poster = await createPoster(source.uri);
    posterBlob = poster.blob;
    posterUri = poster.uri;
    width = width ?? positive(poster.width);
    height = height ?? positive(poster.height);
  } catch (error) {
    // A missing cover is not worth blocking the reel over; the feed falls back to the video.
    if (__DEV__) console.warn('reel poster failed:', error);
  }

  return {
    uri: source.uri,
    durationMs: allowedMs,
    width,
    height,
    bytes,
    contentType,
    posterUri,
    posterBlob,
  };
}
