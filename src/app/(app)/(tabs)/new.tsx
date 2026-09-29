import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Visibility } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'friends', label: 'Friends' },
  { value: 'private', label: 'Only me' },
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

export default function NewPost() {
  const { session } = useAuth();
  const router = useRouter();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permission needed', 'Allow photo library access to pick an image.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setAsset(result.assets[0]);
  }

  async function publish() {
    if (!session || !asset) return;
    setError(null);
    setBusy(true);
    const uid = session.user.id;
    let uploadedPath: string | null = null;
    let mediaId: string | null = null;
    let postId: string | null = null;

    try {
      const contentType = asset.mimeType ?? 'image/jpeg';
      const ext = MIME_EXT[contentType] ?? 'jpg';
      const buf = await (await fetch(asset.uri)).arrayBuffer();

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
          width: asset.width,
          height: asset.height,
          bytes: asset.fileSize ?? buf.byteLength,
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
      const detail = e instanceof Error ? e.message : (e as { message?: string })?.message;
      if (__DEV__) console.warn('publish failed:', e);
      setError(
        __DEV__ && detail ? `Could not publish the post: ${detail}` : 'Could not publish the post',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={pick} style={styles.picker} accessibilityRole="button">
        {asset ? (
          <Image source={{ uri: asset.uri }} style={styles.preview} contentFit="cover" />
        ) : (
          <Text style={styles.pickerText}>Choose an image</Text>
        )}
      </Pressable>
      {asset ? (
        <Button title="Choose a different image" variant="secondary" onPress={pick} />
      ) : null}

      <Field
        label="Caption"
        hint={`${caption.length}/2200`}
        value={caption}
        onChangeText={setCaption}
        multiline
        maxLength={2200}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Who can see this</Text>
        <View style={styles.options}>
          {VISIBILITY_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: visibility === o.value }}
              onPress={() => setVisibility(o.value)}
              style={[styles.option, visibility === o.value && styles.optionActive]}
            >
              <Text style={styles.optionText}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ErrorText message={error} />
      <Button title="Post" onPress={publish} disabled={!asset} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg },
  picker: {
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickerText: { color: colors.muted, fontSize: 16 },
  preview: { width: '100%', height: '100%' },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  optionActive: { backgroundColor: colors.accent },
  optionText: { fontSize: 14, fontWeight: '600', color: colors.text },
});
