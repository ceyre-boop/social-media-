import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ReelPreview } from '@/components/create/ReelPreview';
import { brand } from '@/config/brand';
import { ReelRecorder, type RecordedReel } from '@/components/create/ReelRecorder';
import { UploadProgress } from '@/components/create/UploadProgress';

import {
  AppBar,
  Button,
  IconButton,
  Screen,
  SegmentedControl,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import type { Segment } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ImageProblem, MAX_UPLOAD_BYTES, checkPickedAsset, prepareImage } from '@/lib/image';
import type { Visibility } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META, VISIBILITY_ORDER } from '@/lib/visibility';
import { UploadAbortedError } from '@/lib/storage';
import {
  REEL_MAX_BYTES,
  ReelClipProblem,
  prepareReelDraft,
  type ReelSource,
} from '@/lib/upload/clip';
import {
  createReelJob,
  discardReelJob,
  runReelJob,
  type ReelDraft,
  type ReelJob,
  type ReelProgress,
} from '@/lib/upload/reel';

const SEGMENTS: Segment<Visibility>[] = VISIBILITY_ORDER.map((value) => ({
  value,
  label: VISIBILITY_META[value].label,
  icon: VISIBILITY_META[value].icon,
}));

type CreateMode = 'photo' | 'reel' | 'moment';
/** idle: nothing sent yet · uploading · failed: Retry resumes · cancelled: Post resumes. */
type ReelState = 'idle' | 'uploading' | 'failed' | 'cancelled';

const MODES: Segment<CreateMode>[] = [
  { value: 'photo', label: 'Photo', icon: 'image-outline' },
  { value: 'reel', label: 'Reel', icon: 'videocam-outline' },
  { value: 'moment', label: brand.moment.singular, icon: 'camera-outline' },
];

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

function uniqueId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Create() {
  const { colors, radius, spacing } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const navClearance = useNavClearance();
  const { session, handleError } = useAuth();
  const router = useRouter();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const [mode, setMode] = useState<CreateMode>('photo');
  const [draft, setDraft] = useState<ReelDraft | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [reelState, setReelState] = useState<ReelState>('idle');
  const [progress, setProgress] = useState<ReelProgress | null>(null);
  const jobRef = useRef<ReelJob | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous guard: a second tap can land before React re-renders the disabled button.
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const uploading = reelState === 'uploading';
  const inFlight = busy || uploading;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Web: warn before closing the tab while an upload is in flight.
  useEffect(() => {
    if (!inFlight || Platform.OS !== 'web') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [inFlight]);

  const acceptClip = useCallback(
    async (source: ReelSource) => {
      setError(null);
      setPreparing(true);
      try {
        const next = await prepareReelDraft(source);
        if (!mountedRef.current) return;
        // A new clip means a new file: never resume a previous clip's upload into it.
        const old = jobRef.current;
        jobRef.current = null;
        if (old) void discardReelJob(old);
        setReelState('idle');
        setProgress(null);
        setDraft(next);
      } catch (e) {
        if (!mountedRef.current) return;
        if (e instanceof ReelClipProblem) setError(e.message);
        else setError(handleError(e, 'reel prepare').message);
      } finally {
        if (mountedRef.current) setPreparing(false);
      }
    },
    [handleError],
  );

  async function chooseVideo() {
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return setError('Allow photo library access to pick a video.');
      }
      const result = await ImagePicker.launchImageLibraryAsync(
        Platform.OS === 'ios'
          ? {
              mediaTypes: ['videos'],
              // Apple's own trimmer caps the clip at 30 s and re-encodes it at 720p.
              allowsEditing: true,
              videoMaxDuration: 30,
              videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
            }
          : { mediaTypes: ['videos'] },
      );
      if (result.canceled) return;
      const picked = result.assets[0];
      if (!picked) return;
      if (picked.fileSize && picked.fileSize > REEL_MAX_BYTES) {
        return setError('That video is over 60 MB. Try a shorter clip.');
      }
      await acceptClip({
        uri: picked.uri,
        durationMs: picked.duration ?? null,
        width: picked.width,
        height: picked.height,
        bytes: picked.fileSize ?? null,
        mimeType: picked.mimeType ?? null,
        fileName: picked.fileName ?? null,
        file: picked.file ?? null,
      });
    } catch (e) {
      setError(handleError(e, 'pick video').message);
    }
  }

  function onRecorded(clip: RecordedReel) {
    void acceptClip({ uri: clip.uri, durationMs: clip.durationMs });
  }

  /** Drop the current job and clean up whatever it already uploaded (best effort). */
  function discardJob() {
    const job = jobRef.current;
    jobRef.current = null;
    if (job) void discardReelJob(job);
  }

  function removeClip() {
    abortRef.current?.abort();
    discardJob();
    setDraft(null);
    setProgress(null);
    setReelState('idle');
    setError(null);
  }

  async function publishReel() {
    if (!session || !draft || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const job = jobRef.current ?? createReelJob(session.user.id, draft);
    jobRef.current = job;
    const controller = new AbortController();
    abortRef.current = controller;
    setReelState('uploading');
    setProgress({ phase: 'video', sent: 0, total: draft.bytes, resuming: job.videoMadeProgress });
    try {
      await runReelJob(job, {
        caption,
        visibility,
        signal: controller.signal,
        onProgress: (p) => {
          if (mountedRef.current) setProgress(p);
        },
      });
      if (!mountedRef.current) return;
      jobRef.current = null;
      setDraft(null);
      setCaption('');
      setVisibility('public');
      setProgress(null);
      setReelState('idle');
      // Home refetches on focus, so the new reel is there when it appears.
      router.navigate('/');
      toast.show({ message: 'Your reel is up', tone: 'success' });
    } catch (e) {
      if (!mountedRef.current) return;
      if (e instanceof UploadAbortedError || controller.signal.aborted) {
        // Form and job are kept; posting again resumes the upload where it stopped.
        setReelState('cancelled');
      } else {
        const ue = handleError(e, 'publish reel');
        setError(__DEV__ && ue.detail ? `${ue.message} (${ue.detail})` : ue.message);
        setReelState('failed');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      submittingRef.current = false;
    }
  }

  function cancelReel() {
    abortRef.current?.abort();
  }

  async function pick() {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return setError('Allow photo library access to pick a photo.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled) return;
      const picked = result.assets[0];
      const problem = checkPickedAsset(picked);
      if (problem) return setError(problem);
      setAsset(picked);
    } catch (e) {
      setError(handleError(e, 'pick').message);
    }
  }

  async function publish() {
    if (!session || !asset || busy) return;
    setError(null);
    setBusy(true);
    const uid = session.user.id;
    let uploadedPath: string | null = null;
    let mediaId: string | null = null;
    let postId: string | null = null;

    try {
      // Downscale + re-encode as JPEG first: uploads stay small and every browser can show them.
      const prepared = await prepareImage(asset);
      const contentType = 'image/jpeg';
      const ext = MIME_EXT[contentType];
      const buf = await (await fetch(prepared.uri)).arrayBuffer();
      if (buf.byteLength > MAX_UPLOAD_BYTES) {
        throw new ImageProblem('That photo is still over 15 MB. Pick a smaller one.');
      }

      const path = `${uid}/${uniqueId()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('media')
        .upload(path, buf, { contentType });
      if (upErr) throw upErr;
      uploadedPath = path;

      const { data: media, error: mErr } = await supabase
        .from('media_assets')
        .insert({
          owner_id: uid,
          kind: 'image',
          status: 'ready',
          provider: 'supabase',
          provider_asset_id: path,
          width: prepared.width,
          height: prepared.height,
          bytes: buf.byteLength,
        })
        .select('id')
        .single();
      if (mErr) throw mErr;
      mediaId = media.id;

      const { data: post, error: pErr } = await supabase
        .from('posts')
        .insert({
          author_id: uid,
          kind: 'post',
          caption: caption.trim() || null,
          visibility,
        })
        .select('id')
        .single();
      if (pErr) throw pErr;
      postId = post.id;

      const { error: linkErr } = await supabase
        .from('post_media')
        .insert({ post_id: post.id, media_id: media.id, position: 0 });
      if (linkErr) throw linkErr;

      setAsset(null);
      setCaption('');
      setVisibility('public');
      router.navigate('/');
    } catch (e) {
      // Best-effort cleanup. Hard deletes are not allowed by RLS, so soft-delete rows.
      const now = new Date().toISOString();
      const warn = (step: string, err: { message: string } | null) => {
        if (err && __DEV__) console.warn(`cleanup: ${step} failed:`, err.message);
      };
      if (postId) {
        const { error: err } = await supabase
          .from('posts')
          .update({ deleted_at: now })
          .eq('id', postId);
        warn('soft-delete post', err);
      }
      if (mediaId) {
        const { error: err } = await supabase
          .from('media_assets')
          .update({ deleted_at: now })
          .eq('id', mediaId);
        warn('mark media deleted', err);
      }
      // Once a media row exists the object is attached (immutable to clients): the soft delete above
      // is the removal, and the server purges the object. Only an unattached upload is removed here.
      if (uploadedPath && !mediaId) {
        const { error: err } = await supabase.storage.from('media').remove([uploadedPath]);
        warn('remove storage object', err);
      }
      // The form state (photo, caption, visibility) is kept so they can just tap Post again.
      if (e instanceof ImageProblem) setError(e.message);
      else {
        const ue = handleError(e, 'publish');
        setError(__DEV__ && ue.detail ? `${ue.message} (${ue.detail})` : ue.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const reelArea = draft ? (
    <ReelPreview
      draft={draft}
      disabled={uploading || preparing}
      onChange={removeClip}
      onRemove={removeClip}
    />
  ) : (
    <View style={{ gap: spacing.md }}>
      <View
        style={[
          styles.dropzone,
          {
            borderColor: colors.border,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.lg,
          },
        ]}
      >
        <Ionicons name="videocam-outline" size={40} color={colors.textSecondary} />
        <Text variant="headline">Share a reel</Text>
        <Text variant="caption" tone="muted">
          Up to 30 seconds
        </Text>
      </View>
      {Platform.OS === 'web' ? (
        <Text variant="caption" tone="muted">
          Recording works in the app
        </Text>
      ) : (
        <Button
          title="Record"
          icon="radio-button-on"
          onPress={() => setRecorderOpen(true)}
          disabled={preparing}
        />
      )}
      <Button
        title={preparing ? 'Getting it ready…' : 'Choose video'}
        variant="secondary"
        icon="film-outline"
        onPress={() => void chooseVideo()}
        disabled={preparing}
      />
    </View>
  );

  const previewRatio = asset ? Math.min(Math.max(asset.width / asset.height, 0.5), 2) : 1;

  const modePicker = (
    <SegmentedControl
      label="What are you posting"
      segments={MODES}
      value={mode}
      onChange={(next) => {
        if (inFlight || preparing) return;
        setError(null);
        setMode(next);
      }}
    />
  );

  // Moment: camera only, friends only. The composer is its own full-screen page.
  if (mode === 'moment') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppBar title="Create" />
        <Screen title="Create" scroll padded>
          {modePicker}
          <View
            style={[
              styles.dropzone,
              {
                borderColor: colors.border,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
                padding: spacing.lg,
              },
            ]}
          >
            <Ionicons name="camera-outline" size={40} color={colors.textSecondary} />
            <Text variant="headline">{`Share a ${brand.moment.singular}`}</Text>
            <Text variant="caption" tone="muted" align="center">
              A photo of right now, from the camera. Only your friends see it.
            </Text>
          </View>
          <Button
            title="Open camera"
            icon="camera-outline"
            onPress={() => router.push('/moments/new')}
          />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Create" />
      {recorderOpen ? (
        <ReelRecorder
          visible
          onClose={() => setRecorderOpen(false)}
          onRecorded={onRecorded}
          onError={(message) => setError(message)}
        />
      ) : null}
      <Screen title="Create" scroll padded>
        {modePicker}
        {mode === 'reel' ? (
          reelArea
        ) : asset ? (
          <View style={{ gap: spacing.sm }}>
            <View
              style={[
                styles.previewBox,
                {
                  aspectRatio: previewRatio,
                  maxHeight: windowHeight * 0.6,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface2,
                },
              ]}
            >
              <Image
                source={{ uri: asset.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel="Selected photo preview"
              />
              <IconButton
                icon="close"
                label="Remove photo"
                onPress={() => setAsset(null)}
                onMedia
                style={styles.remove}
              />
            </View>
            <Button title="Change" variant="secondary" icon="images-outline" onPress={pick} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a photo"
            onPress={pick}
            style={(state) => {
              const hovered = (state as { hovered?: boolean }).hovered;
              return [
                styles.dropzone,
                {
                  borderColor: hovered || state.pressed ? colors.borderStrong : colors.border,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                },
              ];
            }}
          >
            <Ionicons name="image-outline" size={40} color={colors.textSecondary} />
            <Text variant="headline">Choose a photo</Text>
          </Pressable>
        )}

        <TextField
          label="Caption"
          value={caption}
          onChangeText={setCaption}
          counter={`${caption.length}/2200`}
          multiline
          maxLength={2200}
        />

        <View style={{ gap: spacing.sm }}>
          <Text variant="callout">Who can see this</Text>
          <SegmentedControl
            label="Who can see this"
            segments={SEGMENTS}
            value={visibility}
            onChange={setVisibility}
          />
          <Text variant="caption" tone="muted">
            {VISIBILITY_META[visibility].explain}
          </Text>
        </View>

        {error ? <Text tone="danger">{error}</Text> : null}
        {mode === 'reel' && reelState === 'cancelled' && !error ? (
          <Text tone="muted">Upload cancelled. Post again to pick up where it stopped.</Text>
        ) : null}
        {mode === 'reel' && uploading && progress ? (
          <UploadProgress progress={progress} onCancel={cancelReel} />
        ) : null}
      </Screen>
      <View
        style={[
          styles.footer,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
            padding: spacing.lg,
            paddingBottom: spacing.lg + navClearance,
          },
        ]}
      >
        {mode === 'reel' ? (
          <Button
            title={uploading ? 'Posting…' : reelState === 'failed' ? 'Retry' : 'Post'}
            onPress={() => void publishReel()}
            disabled={!draft || uploading || preparing}
            icon={uploading ? undefined : reelState === 'failed' ? 'refresh' : 'send'}
          />
        ) : (
          <Button
            title={busy ? 'Posting…' : 'Post'}
            onPress={publish}
            disabled={!asset || busy}
            icon={busy ? undefined : 'send'}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    minHeight: 200,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  previewBox: { width: '100%', overflow: 'hidden' },
  remove: { position: 'absolute', top: 8, right: 8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
