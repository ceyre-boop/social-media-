import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_EDGE = 2048;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** A problem the user can fix by choosing a different file. Message is user-facing. */
export class ImageProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProblem';
  }
}

function mimeOf(asset: ImagePickerAsset): string | null {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(asset.fileName ?? asset.uri)?.[1]?.toLowerCase();
  return ext ? (EXT_MIME[ext] ?? null) : null;
}

/** Cheap checks right after picking. Returns a user-facing problem or null. */
export function checkPickedAsset(asset: ImagePickerAsset): string | null {
  if (asset.type && asset.type !== 'image') return 'Smiley posts are photos only for now.';
  const mime = mimeOf(asset);
  if (mime && !ALLOWED_MIME.has(mime)) return 'Use a JPEG, PNG, WebP or HEIC photo.';
  if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES * 4) {
    return 'That photo is very large. Pick one under 60 MB.';
  }
  return null;
}

export type PreparedImage = { uri: string; width: number; height: number };

/** Downscale to <= MAX_EDGE on the long side and re-encode as JPEG so uploads stay small. */
export async function prepareImage(asset: ImagePickerAsset): Promise<PreparedImage> {
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const long = Math.max(asset.width, asset.height);
    if (long > MAX_EDGE) {
      ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const rendered = await ctx.renderAsync();
    const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: out.uri, width: out.width, height: out.height };
  } catch {
    throw new ImageProblem("We couldn't read that photo. Try a different one (JPEG, PNG or WebP).");
  }
}
