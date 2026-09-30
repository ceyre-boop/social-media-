import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, PageTitle, Text, TextField, useToast } from '@/components/ui';
import { brand } from '@/config/brand';
import { useAuth } from '@/lib/auth';
import { askForMomentPrompts, postMoment, prepareCapture, type CapturedPhoto } from '@/lib/moments';
import { bakeEffect } from '@/lib/moments/bake';
import { CAMERA_EFFECTS, effectById, type CameraEffectId } from '@/lib/moments/effects';
import { stage as c, useTheme } from '@/lib/theme';

/**
 * Share a Moment: in-app camera ONLY (no library import; the point is the actual current moment).
 * Capture → optional warm camera effect (baked into the JPEG with Skia) → optional caption → share
 * with friends. Works with or without a prompt; nothing expires.
 */
export default function NewMoment() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { session, handleError } = useAuth();
  const [permission, askCamera] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [effect, setEffect] = useState<CameraEffectId>('none');
  const [baked, setBaked] = useState<{ id: CameraEffectId; token: number; base64: string } | null>(
    null,
  );
  const captureToken = useRef(0);
  const bakeSeq = useRef(0);
  const inFlight = useRef(0);
  const [baking, setBaking] = useState(false);
  const [effectsOff, setEffectsOff] = useState(false);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(askForMomentPrompts, []);

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  async function capture() {
    if (!camera.current || !ready) return;
    setError(null);
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.9 });
      if (!shot) return;
      const next = await prepareCapture({ uri: shot.uri, width: shot.width, height: shot.height });
      newCapture();
      setPhoto(next);
    } catch (e) {
      setError(handleError(e, 'moment capture').message);
    }
  }

  /** A new capture (or a retake): any bake still running belongs to the old photo and is dropped. */
  function newCapture() {
    captureToken.current += 1;
    setEffect('none');
    setBaked(null);
  }

  function retake() {
    if (baking) return;
    newCapture();
    setPhoto(null);
  }

  async function chooseEffect(id: CameraEffectId) {
    if (!photo || baking) return;
    setEffect(id);
    if (id === 'none' || (baked?.id === id && baked.token === captureToken.current)) return;
    const token = captureToken.current;
    const seq = ++bakeSeq.current;
    inFlight.current += 1;
    setBaking(true);
    try {
      const out = await bakeEffect(photo.uri, effectById(id));
      // Stale: the photo changed, or a later bake was started. Drop it.
      if (token === captureToken.current && seq === bakeSeq.current) {
        setBaked({ id, token, base64: out.base64 });
      }
    } catch (e) {
      if (__DEV__) console.warn('camera effect failed', e);
      if (token === captureToken.current) {
        setEffectsOff(true);
        setEffect('none');
      }
    } finally {
      inFlight.current -= 1;
      setBaking(inFlight.current > 0);
    }
  }

  async function share() {
    if (!session || !photo || busy || baking) return;
    setBusy(true);
    setError(null);
    try {
      const base64 =
        effect !== 'none' && baked?.id === effect && baked.token === captureToken.current
          ? baked.base64
          : null;
      await postMoment(session.user.id, {
        photo,
        bakedBase64: base64,
        effect: base64 ? effect : 'none',
        caption,
      });
      toast.show({ message: `Shared with your friends`, tone: 'success' });
      router.replace('/moments');
    } catch (e) {
      setError(handleError(e, 'moment post').message);
    } finally {
      setBusy(false);
    }
  }

  const previewUri =
    photo && effect !== 'none' && baked?.id === effect
      ? `data:image/jpeg;base64,${baked.base64}`
      : photo?.uri;

  let body: React.ReactNode;
  if (!permission) {
    body = null;
  } else if (!permission.granted && !photo) {
    body = (
      <View style={styles.center}>
        <Text variant="headline" tone="onMedia" align="center">
          {`${brand.moment.plural} use the camera`}
        </Text>
        <Text tone="onMediaMuted" align="center" style={styles.narrow}>
          {`A ${brand.moment.singular} is a photo of right now, taken here. Photos from your library can't be used.`}
        </Text>
        <View style={{ width: 220 }}>
          <Button title="Allow camera" variant="secondary" onPress={() => void askCamera()} />
        </View>
      </View>
    );
  } else if (!photo) {
    body = (
      <View style={{ flex: 1 }}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="picture"
          onCameraReady={() => setReady(true)}
          onMountError={(e) => setError(e.message)}
        />
        <View style={[styles.shutterRow, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.side} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            disabled={!ready}
            onPress={() => void capture()}
            style={({ pressed }) => [styles.shutter, { opacity: !ready ? 0.5 : pressed ? 0.8 : 1 }]}
          />
          <View style={styles.side}>
            {Platform.OS === 'web' ? null : (
              <IconButton
                icon="camera-reverse-outline"
                label="Flip camera"
                onMedia
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              />
            )}
          </View>
        </View>
      </View>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={[styles.review, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.preview, { aspectRatio: photo.width / photo.height }]}>
          <Image
            source={{ uri: previewUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Your photo"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.effects}
        >
          {(effectsOff ? CAMERA_EFFECTS.slice(0, 1) : CAMERA_EFFECTS).map((e) => {
            const on = e.id === effect;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, busy: on && baking, disabled: baking }}
                disabled={baking}
                accessibilityLabel={e.label}
                onPress={() => void chooseEffect(e.id)}
                style={[styles.effect, on && styles.effectOn]}
              >
                <Text variant="caption" tone={on ? 'onMedia' : 'onMediaMuted'}>
                  {on && baking ? '…' : e.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {effectsOff ? (
          <Text variant="caption" tone="onMediaMuted">
            Effects aren&apos;t available here right now. Your photo will be shared as it is.
          </Text>
        ) : null}
        <View style={[styles.field, { backgroundColor: colors.surface }]}>
          <TextField
            label="Caption (optional)"
            value={caption}
            onChangeText={setCaption}
            maxLength={2200}
          />
        </View>
        <Text variant="caption" tone="onMediaMuted">
          Only your friends can see this. There is no link to it.
        </Text>
        {error ? <Text tone="danger">{error}</Text> : null}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button title="Retake" variant="secondary" onPress={retake} disabled={busy || baking} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={busy ? 'Sharing…' : 'Share'}
              icon={busy ? undefined : 'send'}
              loading={busy}
              disabled={baking}
              onPress={() => void share()}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <PageTitle title={`Share a ${brand.moment.singular}`} />
      {body}
      {error && !photo ? (
        <Text tone="danger" style={[styles.error, { top: insets.top + 64 }]}>
          {error}
        </Text>
      ) : null}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Text variant="headline" tone="onMedia">
          {`Share a ${brand.moment.singular}`}
        </Text>
        <IconButton icon="close" label="Close" onMedia onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  narrow: { maxWidth: 340 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.scrimTop,
  },
  shutterRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  side: { width: 56, alignItems: 'center' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: c.pillBorder,
    backgroundColor: c.pillFill,
  },
  review: {
    paddingTop: 72,
    paddingHorizontal: 16,
    gap: 14,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  preview: {
    width: '100%',
    maxHeight: 560,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: c.surface2,
  },
  effects: { gap: 8 },
  effect: {
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
  },
  effectOn: { backgroundColor: c.glassActive, borderColor: c.pillBorder },
  field: { borderRadius: 14, padding: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  error: { position: 'absolute', left: 16, right: 16 },
});
