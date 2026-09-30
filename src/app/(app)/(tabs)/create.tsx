import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import {
  AppBar,
  Button,
  IconButton,
  Screen,
  SegmentedControl,
  Text,
  TextField,
} from '@/components/ui';
import type { Segment } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ImageProblem, MAX_UPLOAD_BYTES, checkPickedAsset, prepareImage } from '@/lib/image';
import type { Visibility } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { useNavClearance } from '@/lib/layout';
import { useTheme } from '@/lib/theme';
import { VISIBILITY_META, VISIBILITY_ORDER } from '@/lib/visibility';

const SEGMENTS: Segment<Visibility>[] = VISIBILITY_ORDER.map((value) => ({
  value,
  label: VISIBILITY_META[value].label,
  icon: VISIBILITY_META[value].icon,
}));

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

  // Web: warn before closing the tab while an upload is in flight.
  useEffect(() => {
    if (!busy || Platform.OS !== 'web') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

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
      if (uploadedPath) {
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

  const previewRatio = asset ? Math.min(Math.max(asset.width / asset.height, 0.5), 2) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Create" />
      <Screen title="Create" scroll padded>
        {asset ? (
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
                  borderColor: hovered || state.pressed ? colors.primary : colors.border,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                },
              ];
            }}
          >
            <Ionicons name="image-outline" size={40} color={colors.primary} />
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
        <Button
          title={busy ? 'Posting…' : 'Post'}
          onPress={publish}
          disabled={!asset || busy}
          icon={busy ? undefined : 'send'}
        />
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
