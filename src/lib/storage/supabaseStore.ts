import { Platform } from 'react-native';

import { supabase, supabaseUrl } from '@/lib/supabase';

import { MediaStoreError, UploadAbortedError, type MediaStore, type UploadOptions } from './types';

const BUCKET = 'media';
const DEFAULT_TTL_SECONDS = 3600;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const CREATE_OR_HEAD_TIMEOUT_MS = 20_000;
const CHUNK_TIMEOUT_MS = 60_000;
const RESPONSE_BODY_TIMEOUT_MS = 4_000;
const RETRY_DELAYS_MS = [500, 1500] as const;

type ResumeEntry = {
  location: string;
  path: string;
  total: number;
  contentType: string;
};

type ErrorShape = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
};

const resumes = new Map<string, ResumeEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbort(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (isAbort(signal)) throw new UploadAbortedError();
}

function fileSize(file: Blob | ArrayBuffer): number {
  return file instanceof Blob ? file.size : file.byteLength;
}

function sliceFile(file: Blob | ArrayBuffer, start: number, end: number): Blob | ArrayBuffer {
  return file instanceof Blob ? file.slice(start, end) : file.slice(start, end);
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function resumeStorageKey(resumeKey: string): string {
  return `smiley.tus.${resumeKey}`;
}

function readLocalResume(resumeKey: string): ResumeEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(resumeStorageKey(resumeKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.location !== 'string' ||
      !parsed.location ||
      typeof parsed.path !== 'string' ||
      typeof parsed.total !== 'number' ||
      !Number.isFinite(parsed.total) ||
      parsed.total < 0 ||
      typeof parsed.contentType !== 'string'
    ) {
      return null;
    }
    return {
      location: parsed.location,
      path: parsed.path,
      total: parsed.total,
      contentType: parsed.contentType,
    };
  } catch {
    return null;
  }
}

function saveResume(resumeKey: string | undefined, entry: ResumeEntry): void {
  if (!resumeKey) return;
  resumes.set(resumeKey, entry);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(resumeStorageKey(resumeKey), JSON.stringify(entry));
  } catch {
    // Local persistence is optional; the in-memory resume entry remains available.
  }
}

function clearResume(resumeKey: string | undefined): void {
  if (!resumeKey) return;
  resumes.delete(resumeKey);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(resumeStorageKey(resumeKey));
  } catch {
    // Local persistence is optional and may be unavailable (for example, private browsing).
  }
}

function matchingResume(
  resumeKey: string | undefined,
  path: string,
  total: number,
  contentType: string,
): ResumeEntry | null {
  if (!resumeKey) return null;
  const entry = resumes.get(resumeKey) ?? readLocalResume(resumeKey);
  if (!entry) return null;
  if (entry.path === path && entry.total === total && entry.contentType === contentType) return entry;
  clearResume(resumeKey);
  return null;
}

function parseOffset(value: string | null, total: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) return null;
  return offset;
}

function errorShape(error: unknown): { message: string; status: number; code: string } {
  if (!isRecord(error)) return { message: String(error || 'Media request failed'), status: 0, code: '' };
  const value = error as ErrorShape;
  const rawStatus = value.status ?? value.statusCode;
  const status = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);
  return {
    message: typeof value.message === 'string' && value.message ? value.message : 'Media request failed',
    status: Number.isFinite(status) ? status : 0,
    code: typeof value.code === 'string' ? value.code : '',
  };
}

function asMediaError(error: unknown): MediaStoreError {
  if (error instanceof MediaStoreError) return error;
  const { message, status, code } = errorShape(error);
  return new MediaStoreError(message, { status, code, cause: error });
}

function timeoutError(): MediaStoreError {
  return new MediaStoreError('Upload timed out', { status: 408, code: 'upload_timeout' });
}

async function waitFor<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError()), timeoutMs);
      onAbort = () => reject(new UploadAbortedError());
      signal?.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    throwIfAborted(signal);
    return response;
  } catch (error) {
    if (isAbort(signal)) throw new UploadAbortedError();
    if (timedOut) throw timeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function responseText(response: Response, signal?: AbortSignal): Promise<string> {
  try {
    return await waitFor(response.text(), RESPONSE_BODY_TIMEOUT_MS, signal);
  } catch (error) {
    if (error instanceof UploadAbortedError) throw error;
    return '';
  }
}

function messageFromBody(body: string): string {
  if (!body) return '';
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) {
      if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
      if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
    }
  } catch {
    // A non-JSON server response is still useful as an error message below.
  }
  return body.slice(0, 1000);
}

async function responseError(response: Response, signal?: AbortSignal): Promise<MediaStoreError> {
  const body = messageFromBody(await responseText(response, signal));
  // Keep the server's own sentence as the message: toUserError classifies on it (and a
  // prefix like "Upload failed" would match its "load failed" network pattern).
  return new MediaStoreError(body || `Storage responded with HTTP ${response.status}`, {
    status: response.status,
    code: `http_${response.status}`,
  });
}

function tusHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    'tus-resumable': '1.0.0',
  };
}

async function sessionToken(signal?: AbortSignal): Promise<string> {
  const result = await waitFor(supabase.auth.getSession(), CREATE_OR_HEAD_TIMEOUT_MS, signal);
  const token = result.data.session?.access_token;
  if (!token) throw new MediaStoreError('Not authenticated', { status: 401, code: 'not_authenticated' });
  return token;
}

async function refreshedToken(signal?: AbortSignal): Promise<string> {
  const result = await waitFor(supabase.auth.refreshSession(), CREATE_OR_HEAD_TIMEOUT_MS, signal);
  const token = result.data.session?.access_token;
  if (!token) throw new MediaStoreError('Not authenticated', { status: 401, code: 'not_authenticated' });
  return token;
}

/** The job's own object already exists (paths are unique per job), so a retry is a success. */
function alreadyExists(error: unknown): boolean {
  const { status, message } = errorShape(error);
  return status === 409 || /already exists|duplicate/i.test(message);
}

function authFailure(error: unknown): boolean {
  const status = error instanceof MediaStoreError ? error.status : errorShape(error).status;
  return status === 401 || status === 403;
}

async function headOffset(location: string, total: number, token: string, signal?: AbortSignal): Promise<number> {
  const response = await fetchWithTimeout(
    location,
    { method: 'HEAD', headers: tusHeaders(token) },
    CREATE_OR_HEAD_TIMEOUT_MS,
    signal,
  );
  if (response.status !== 200) throw await responseError(response, signal);
  const offset = parseOffset(response.headers.get('upload-offset'), total);
  if (offset === null) {
    throw new MediaStoreError('Upload server returned an invalid upload offset', {
      status: response.status,
      code: 'invalid_upload_offset',
    });
  }
  return offset;
}

async function createUpload(
  path: string,
  total: number,
  contentType: string,
  token: string,
  signal?: AbortSignal,
): Promise<string> {
  const metadata = [
    `bucketName ${base64(BUCKET)}`,
    `objectName ${base64(path)}`,
    `contentType ${base64(contentType)}`,
    `cacheControl ${base64('3600')}`,
  ].join(',');
  const response = await fetchWithTimeout(
    `${supabaseUrl}/storage/v1/upload/resumable`,
    {
      method: 'POST',
      headers: {
        ...tusHeaders(token),
        'upload-length': String(total),
        'upload-metadata': metadata,
        'x-upsert': 'false',
      },
    },
    CREATE_OR_HEAD_TIMEOUT_MS,
    signal,
  );
  if (response.status !== 201) throw await responseError(response, signal);
  const location = response.headers.get('location');
  if (!location?.trim()) {
    throw new MediaStoreError('Upload server did not return an upload location', {
      status: response.status,
      code: 'missing_upload_location',
    });
  }
  try {
    return new URL(location, supabaseUrl).toString();
  } catch {
    throw new MediaStoreError('Upload server returned an invalid upload location', {
      status: response.status,
      code: 'invalid_upload_location',
    });
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof UploadAbortedError) return false;
  if (error instanceof MediaStoreError) {
    return error.status === 408 || error.status === 429 || error.status >= 500 || error.status === 0;
  }
  return true;
}

async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadAbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function patchChunk(
  location: string,
  offset: number,
  chunk: Blob | ArrayBuffer,
  total: number,
  token: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetchWithTimeout(
    location,
    {
      method: 'PATCH',
      headers: {
        ...tusHeaders(token),
        'upload-offset': String(offset),
        'content-type': 'application/offset+octet-stream',
      },
      body: chunk,
    },
    CHUNK_TIMEOUT_MS,
    signal,
  );
  // 409 = offset mismatch; the caller re-reads the server offset and continues.
  if (response.status !== 204) throw await responseError(response, signal);
  const nextOffset = parseOffset(response.headers.get('upload-offset'), total);
  if (nextOffset === null || nextOffset <= offset) {
    throw new MediaStoreError('Upload server returned an invalid upload offset', {
      status: response.status,
      code: 'invalid_upload_offset',
    });
  }
  return nextOffset;
}

async function uploadVideo(path: string, file: Blob | ArrayBuffer, opts: UploadOptions): Promise<{ path: string }> {
  throwIfAborted(opts.signal);
  const total = fileSize(file);
  const auth = { token: await sessionToken(opts.signal) };
  // An expired access token mid-upload: refresh the session and retry the call once.
  const authed = async <T>(run: (token: string) => Promise<T>): Promise<T> => {
    try {
      return await run(auth.token);
    } catch (error) {
      if (!authFailure(error)) throw error;
      auth.token = await refreshedToken(opts.signal);
      return run(auth.token);
    }
  };
  const create = async (): Promise<string | null> => {
    try {
      return await authed((t) => createUpload(path, total, opts.contentType, t, opts.signal));
    } catch (error) {
      if (error instanceof UploadAbortedError || !alreadyExists(error)) throw error;
      return null; // a previous attempt already finished this object
    }
  };
  const existing = matchingResume(opts.resumeKey, path, total, opts.contentType);
  let location: string;
  let offset = 0;
  const finished = () => {
    clearResume(opts.resumeKey);
    opts.onProgress?.(total, total);
    return { path };
  };

  if (existing) {
    try {
      offset = await authed((t) => headOffset(existing.location, total, t, opts.signal));
      location = existing.location;
    } catch (error) {
      if (error instanceof UploadAbortedError) throw error;
      clearResume(opts.resumeKey);
      const created = await create();
      if (created === null) return finished();
      location = created;
    }
  } else {
    const created = await create();
    if (created === null) return finished();
    location = created;
  }

  saveResume(opts.resumeKey, { location, path, total, contentType: opts.contentType });
  opts.onProgress?.(offset, total);

  while (offset < total) {
    throwIfAborted(opts.signal);
    let lastError: unknown;
    let uploaded = false;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt += 1) {
      try {
        const chunkEnd = Math.min(offset + TUS_CHUNK_BYTES, total);
        const chunk = sliceFile(file, offset, chunkEnd);
        offset = await authed((t) => patchChunk(location, offset, chunk, total, t, opts.signal));
        opts.onProgress?.(offset, total);
        uploaded = true;
        break;
      } catch (error) {
        if (error instanceof UploadAbortedError) throw error;
        lastError = error;
        const status = error instanceof MediaStoreError ? error.status : 0;
        if (status === 409) {
          const serverOffset = await authed((t) => headOffset(location, total, t, opts.signal));
          if (serverOffset === offset) {
            if (attempt === RETRY_DELAYS_MS.length) {
              lastError = new MediaStoreError('Upload offset conflict could not be resolved', {
                status: 409,
                code: 'upload_offset_conflict',
              });
              break;
            }
            await sleep(RETRY_DELAYS_MS[attempt], opts.signal);
            continue;
          }
          offset = serverOffset;
          opts.onProgress?.(offset, total);
          uploaded = true;
          break;
        }
        if (!retryable(error) || attempt === RETRY_DELAYS_MS.length) break;
        try {
          offset = await authed((t) => headOffset(location, total, t, opts.signal));
          if (offset >= total) {
            opts.onProgress?.(offset, total);
            uploaded = true;
            break;
          }
        } catch (headError) {
          if (headError instanceof UploadAbortedError) throw headError;
          if (!retryable(headError)) {
            lastError = headError;
            break;
          }
        }
        if (uploaded) break;
        await sleep(RETRY_DELAYS_MS[attempt], opts.signal);
      }
    }

    if (!uploaded) throw asMediaError(lastError);
  }

  clearResume(opts.resumeKey);
  return { path };
}

async function upload(path: string, file: Blob | ArrayBuffer, opts: UploadOptions): Promise<{ path: string }> {
  throwIfAborted(opts.signal);
  const total = fileSize(file);
  try {
    // Videos go through the resumable (TUS) endpoint; everything else is one request.
    if (opts.contentType.startsWith('video/')) return await uploadVideo(path, file, opts);
    // Native: storage-js wraps a Blob in FormData, which React Native cannot serialize.
    const body = file instanceof Blob && Platform.OS !== 'web' ? await file.arrayBuffer() : file;
    const { error } = await waitFor(
      supabase.storage.from(BUCKET).upload(path, body, { contentType: opts.contentType, upsert: false }),
      CHUNK_TIMEOUT_MS,
      opts.signal,
    );
    throwIfAborted(opts.signal);
    if (error && !alreadyExists(error)) throw asMediaError(error);
    opts.onProgress?.(total, total);
    return { path };
  } catch (error) {
    if (error instanceof UploadAbortedError) throw error;
    throw asMediaError(error);
  }
}

async function signedUrls(paths: string[], ttlSec = DEFAULT_TTL_SECONDS): Promise<Record<string, string | null>> {
  const unique = [...new Set(paths)];
  const urls: Record<string, string | null> = {};
  for (const path of paths) urls[path] = null;
  if (unique.length === 0) return urls;
  try {
    const { data, error } = await waitFor(
      supabase.storage.from(BUCKET).createSignedUrls(unique, ttlSec),
      CREATE_OR_HEAD_TIMEOUT_MS,
    );
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Signed URL response was invalid');
    for (const item of data) {
      if (!isRecord(item) || typeof item.path !== 'string') {
        throw new Error('Signed URL response item was invalid');
      }
      if (typeof item.signedUrl === 'string' && !item.error) urls[item.path] = item.signedUrl;
    }
  } catch (error) {
    if (__DEV__) console.warn('createSignedUrls failed:', error);
  }
  return urls;
}

async function signedUrl(path: string, ttlSec?: number): Promise<string | null> {
  return (await signedUrls([path], ttlSec))[path] ?? null;
}

async function remove(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  try {
    const { error } = await waitFor(supabase.storage.from(BUCKET).remove(unique), CREATE_OR_HEAD_TIMEOUT_MS);
    if (error) throw asMediaError(error);
  } catch (error) {
    throw asMediaError(error);
  }
}

async function discardUploads(resumeKeys: string[]): Promise<void> {
  for (const key of resumeKeys) {
    const entry = resumes.get(key) ?? readLocalResume(key);
    clearResume(key);
    if (!entry) continue;
    try {
      // TUS termination: frees the unfinished server-side session.
      const token = await sessionToken();
      await fetchWithTimeout(
        entry.location,
        { method: 'DELETE', headers: tusHeaders(token) },
        CREATE_OR_HEAD_TIMEOUT_MS,
      );
    } catch {
      // Best effort: an orphaned session expires on its own.
    }
  }
}

export const supabaseStore: MediaStore = { upload, signedUrl, signedUrls, remove, discardUploads };
