/**
 * Moments: friends-only photos from the in-app camera (brief M3 §1).
 *
 * The database decides who sees what (migration 016: author + accepted friends, whatever the
 * visibility column says). These helpers only choose which of the visible moments to show and
 * never fill anything with strangers: the author set is always "me + my friends".
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { brand } from '@/config/brand';
import { fetchFriendIds } from '@/lib/friends';
import { requestPushPermission } from '@/lib/push';
import { mediaStore } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { storedEffectId, type CameraEffectId } from './effects';

export const MOMENTS_WINDOW_DAYS = 7;
/** Long edge of a saved Moment. */
export const MOMENT_MAX_EDGE = 1600;
const SIGNED_URL_TTL_SECONDS = 3600;

export type MomentAuthor = { user_id: string; username: string; display_name: string | null };

export type Moment = {
  id: string;
  author_id: string;
  caption: string | null;
  created_at: string;
  camera_effect: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  aspectRatio: number;
  author: MomentAuthor | null;
};

/** One person's moments, newest first. */
export type MomentPerson = { author: MomentAuthor | null; authorId: string; moments: Moment[] };

type Row = {
  id: string;
  author_id: string;
  caption: string | null;
  created_at: string;
  camera_effect: string | null;
  post_media: {
    position: number;
    media_assets: { provider_asset_id: string | null; width: number | null; height: number | null } | null;
  }[];
};

/** My moments and my friends' from the last week, newest first. */
export async function fetchMoments(me: string): Promise<Moment[]> {
  const authors = [me, ...(await fetchFriendIds())];
  const since = new Date(Date.now() - MOMENTS_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, author_id, caption, created_at, camera_effect, post_media(position, media_assets(provider_asset_id, width, height))',
    )
    .eq('kind', 'moment')
    .is('deleted_at', null)
    .in('author_id', authors)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  const media = new Map(
    rows.map((r) => [r.id, [...r.post_media].sort((a, b) => a.position - b.position)[0]?.media_assets ?? null]),
  );
  const paths = [...media.values()].flatMap((m) => (m?.provider_asset_id ? [m.provider_asset_id] : []));
  const ids = [...new Set(rows.map((r) => r.author_id))];
  const [signed, profiles] = await Promise.all([
    paths.length ? mediaStore.signedUrls(paths, SIGNED_URL_TTL_SECONDS) : Promise.resolve({}),
    ids.length
      ? supabase.from('profiles').select('user_id, username, display_name').in('user_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) throw profiles.error;
  const byId = new Map((profiles.data ?? []).map((p) => [p.user_id, p as MomentAuthor]));
  const urls = signed as Record<string, string | null>;

  return rows.map((r) => {
    const m = media.get(r.id);
    const path = m?.provider_asset_id ?? null;
    const ratio = m?.width && m?.height ? m.width / m.height : 3 / 4;
    return {
      id: r.id,
      author_id: r.author_id,
      caption: r.caption,
      created_at: r.created_at,
      camera_effect: r.camera_effect,
      imagePath: path,
      imageUrl: path ? (urls[path] ?? null) : null,
      aspectRatio: ratio,
      author: byId.get(r.author_id) ?? null,
    };
  });
}

/** Groups moments by person: me first (always, even with none), then friends by latest moment. */
export function groupByPerson(moments: Moment[], me: string): MomentPerson[] {
  const people = new Map<string, MomentPerson>();
  people.set(me, { authorId: me, author: null, moments: [] });
  for (const m of moments) {
    const p = people.get(m.author_id) ?? { authorId: m.author_id, author: m.author, moments: [] };
    p.author ??= m.author;
    p.moments.push(m);
    people.set(m.author_id, p);
  }
  const [mine, ...rest] = [...people.values()];
  rest.sort((a, b) => (a.moments[0]!.created_at < b.moments[0]!.created_at ? 1 : -1));
  return [mine!, ...rest];
}

/** Local midnight today, for "Today" vs "Earlier this week". */
export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

export type CapturedPhoto = { uri: string; width: number; height: number };

/** Downscale a camera capture to MOMENT_MAX_EDGE and re-encode as JPEG. */
export async function prepareCapture(photo: CapturedPhoto): Promise<CapturedPhoto> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MOMENT_MAX_EDGE) {
    ctx.resize(photo.width >= photo.height ? { width: MOMENT_MAX_EDGE } : { height: MOMENT_MAX_EDGE });
  }
  const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
  return { uri: out.uri, width: out.width, height: out.height };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function uniqueId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type NewMoment = {
  photo: CapturedPhoto;
  /** JPEG with the effect baked in; null = the photo as captured. */
  bakedBase64: string | null;
  effect: CameraEffectId;
  caption: string;
};

/** Uploads and posts a Moment. On failure, soft-deletes whatever was created. */
export async function postMoment(uid: string, m: NewMoment): Promise<string> {
  const body = m.bakedBase64
    ? base64ToBytes(m.bakedBase64).buffer
    : await (await fetch(m.photo.uri)).arrayBuffer();
  const path = `${uid}/${uniqueId()}.jpg`;
  let mediaId: string | null = null;
  let postId: string | null = null;
  const { error: upErr } = await supabase.storage
    .from('media')
    .upload(path, body as ArrayBuffer, { contentType: 'image/jpeg' });
  if (upErr) throw upErr;
  try {
    const { data: media, error: mErr } = await supabase
      .from('media_assets')
      .insert({
        owner_id: uid,
        kind: 'image',
        status: 'ready',
        provider: 'supabase',
        provider_asset_id: path,
        width: m.photo.width,
        height: m.photo.height,
        bytes: (body as ArrayBuffer).byteLength,
      })
      .select('id')
      .single();
    if (mErr) throw mErr;
    mediaId = media.id;
    const { data: post, error: pErr } = await supabase
      .from('posts')
      .insert({
        author_id: uid,
        kind: 'moment',
        caption: m.caption.trim() || null,
        camera_effect: storedEffectId(m.effect),
        capture_mode: 'single',
      })
      .select('id')
      .single();
    if (pErr) throw pErr;
    postId = post.id;
    const { error: lErr } = await supabase
      .from('post_media')
      .insert({ post_id: post.id, media_id: media.id, position: 0 });
    if (lErr) throw lErr;
    return post.id;
  } catch (e) {
    const now = new Date().toISOString();
    if (postId) await supabase.from('posts').update({ deleted_at: now }).eq('id', postId);
    if (mediaId) await supabase.from('media_assets').update({ deleted_at: now }).eq('id', mediaId);
    else await supabase.storage.from('media').remove([path]);
    throw e;
  }
}

let askedThisSession = false;

/**
 * The first time someone opens Moments or taps "Share a Moment": explain, then ask for push
 * permission (never at launch). Once per app session; the OS remembers a real answer.
 */
export function askForMomentPrompts(): void {
  if (askedThisSession) return;
  askedThisSession = true;
  void requestPushPermission(
    `Once or twice a day we can send a gentle nudge to share what you're up to with your friends. No streaks, nothing to keep up with.`,
  );
}

export const momentName = brand.moment;
