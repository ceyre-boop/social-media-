
import type { Visibility } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { mediaProvider, mediaStore, MediaStoreError, UploadAbortedError } from '@/lib/storage';

export type ReelDraft = {
  uri: string;
  durationMs: number;
  width: number | null;
  height: number | null;
  bytes: number;
  contentType: 'video/mp4' | 'video/quicktime';
  posterUri?: string | null;
  posterBlob?: Blob | null;
};

type UploadPhase = 'video' | 'poster' | 'saving';
export type ReelProgress = { phase: UploadPhase; sent: number; total: number; resuming: boolean };

export type ReelJob = {
  readonly uid: string;
  readonly draft: ReelDraft;
  videoPath: string;
  posterPath: string;
  resumeKey: string;
  posterResumeKey: string;
  videoUploaded: boolean;
  posterUploaded: boolean;
  videoMadeProgress: boolean;
};

function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function freshPaths(job: ReelJob): void {
  const id = createId();
  const extension = job.draft.contentType === 'video/quicktime' ? 'mov' : 'mp4';
  job.videoPath = `${job.uid}/${id}.${extension}`;
  job.posterPath = `${job.uid}/${id}-poster.jpg`;
  job.resumeKey = `reel:${job.videoPath}`;
  job.posterResumeKey = `reel:${job.posterPath}`;
  job.videoUploaded = false;
  job.posterUploaded = false;
  job.videoMadeProgress = false;
}

export function createReelJob(uid: string, draft: ReelDraft): ReelJob {
  const extension = draft.contentType === 'video/quicktime' ? 'mov' : 'mp4';
  const id = createId();
  const videoPath = `${uid}/${id}.${extension}`;
  const posterPath = `${uid}/${id}-poster.jpg`;
  return {
    uid,
    draft,
    videoPath,
    posterPath,
    resumeKey: `reel:${videoPath}`,
    posterResumeKey: `reel:${posterPath}`,
    videoUploaded: false,
    posterUploaded: false,
    videoMadeProgress: false,
  };
}

async function blobFor(uri: string, signal: AbortSignal): Promise<Blob | ArrayBuffer> {
  const response = await fetch(uri, { signal });
  if (!response.ok) throw new MediaStoreError('Could not read this video');
  const blob = await response.blob();
  return typeof blob.slice === 'function' ? blob : await blob.arrayBuffer();
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || error instanceof UploadAbortedError || (error instanceof Error && error.name === 'AbortError');
}

async function cleanupAfterDatabaseFailure(
  job: ReelJob,
  postId: string | null,
  mediaId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const warn = (step: string, error: { message: string } | null) => {
    if (error && __DEV__) console.warn(`reel cleanup: ${step} failed:`, error.message);
  };
  if (postId) {
    const { error } = await supabase.from('posts').update({ deleted_at: now }).eq('id', postId);
    warn('soft-delete post', error);
  }
  if (mediaId) {
    const { error } = await supabase
      .from('media_assets')
      .update({ deleted_at: now })
      .eq('id', mediaId);
    warn('mark media deleted', error);
  }
  try {
    await mediaStore.remove([job.videoPath, job.posterPath]);
  } catch (error) {
    if (__DEV__) console.warn('reel cleanup: remove storage objects failed:', error);
  }
}

export async function runReelJob(
  job: ReelJob,
  options: {
    caption: string;
    visibility: Visibility;
    signal: AbortSignal;
    onProgress: (progress: ReelProgress) => void;
  },
): Promise<{ postId: string }> {
  const { signal, onProgress } = options;
  const { draft } = job;
  const hasPoster = !!(draft.posterBlob || draft.posterUri);
  if (signal.aborted) throw new UploadAbortedError();

  try {
    if (!job.videoUploaded) {
      // Only a previous attempt that moved bytes makes this one a resume.
      const resuming = job.videoMadeProgress;
      onProgress({ phase: 'video', sent: 0, total: draft.bytes, resuming });
      const video = await blobFor(draft.uri, signal);
      await mediaStore.upload(job.videoPath, video, {
        contentType: draft.contentType,
        signal,
        resumeKey: job.resumeKey,
        onProgress: (sent, total) => {
          if (sent > 0) job.videoMadeProgress = true;
          onProgress({ phase: 'video', sent, total, resuming });
        },
      });
      job.videoUploaded = true;
    }

    const hasPoster = !!(draft.posterBlob || draft.posterUri);
    if (hasPoster && !job.posterUploaded) {
      const poster = draft.posterBlob ?? (await blobFor(draft.posterUri as string, signal));
      const total = poster instanceof Blob ? poster.size : poster.byteLength;
      await mediaStore.upload(job.posterPath, poster, {
        contentType: 'image/jpeg',
        signal,
        resumeKey: job.posterResumeKey,
        onProgress: (sent, uploadedTotal) =>
          onProgress({ phase: 'poster', sent, total: uploadedTotal || total, resuming: false }),
      });
      job.posterUploaded = true;
    }
  } catch (error) {
    if (isAbort(error, signal)) throw new UploadAbortedError();
    throw error;
  }

  if (signal.aborted) throw new UploadAbortedError();
  onProgress({ phase: 'saving', sent: 0, total: 0, resuming: false });
  let mediaId: string | null = null;
  let postId: string | null = null;
  try {
    const { data: media, error: mediaError } = await supabase
      .from('media_assets')
      .insert({
        owner_id: job.uid,
        kind: 'video',
        status: 'ready',
        provider: mediaProvider,
        provider_asset_id: job.videoPath,
        poster_path: hasPoster ? job.posterPath : null,
        duration_ms: Math.max(1, Math.min(30_500, Math.round(draft.durationMs))),
        width: draft.width && Number.isFinite(draft.width) ? Math.round(draft.width) : null,
        height: draft.height && Number.isFinite(draft.height) ? Math.round(draft.height) : null,
        bytes: draft.bytes,
      })
      .select('id')
      .single();
    if (mediaError) throw mediaError;
    mediaId = media.id;
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({ author_id: job.uid, kind: 'reel', caption: options.caption.trim() || null, visibility: options.visibility })
      .select('id')
      .single();
    if (postError) throw postError;
    postId = post.id;
    const { error: linkError } = await supabase
      .from('post_media')
      .insert({ post_id: post.id, media_id: media.id, position: 0 });
    if (linkError) throw linkError;
    return { postId: post.id };
  } catch (error) {
    // Database failure means uploaded objects are removed, so retry must use new paths rather than a stale TUS entry.
    await cleanupAfterDatabaseFailure(job, postId, mediaId);
    freshPaths(job);
    throw error;
  }
}
