import { toUserError, type UserError } from '@/lib/errors';

export type UploadOptions = {
  contentType: string;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  resumeKey?: string;
};

export interface MediaStore {
  upload(path: string, file: Blob | ArrayBuffer, opts: UploadOptions): Promise<{ path: string }>;
  signedUrl(path: string, ttlSec?: number): Promise<string | null>;
  signedUrls(paths: string[], ttlSec?: number): Promise<Record<string, string | null>>;
  remove(paths: string[]): Promise<void>;
}

export class MediaStoreError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userError: UserError;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = 'MediaStoreError';
    this.status = options.status ?? 0;
    this.code = options.code ?? '';
    // Do not pass this Error to toUserError: its dev logger may inspect the error recursively.
    this.userError = toUserError(
      options.cause ?? { message, status: this.status, code: this.code, name: this.name },
      'media',
    );
  }
}

/** A caller-initiated upload cancellation. This is intentionally not a user-facing failure. */
export class UploadAbortedError extends Error {
  constructor(message = 'Upload cancelled') {
    super(message);
    this.name = 'AbortError';
  }
}
