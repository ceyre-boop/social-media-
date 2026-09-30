import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { brand } from '@/config/brand';
import { Button, IconButton, Text } from '@/components/ui';
import { useTheme } from '@/lib/theme';

export type RecordedReel = { uri: string; durationMs: number };

function elapsedLabel(elapsedMs: number): string {
  const seconds = Math.min(30, Math.floor(elapsedMs / 1000));
  return `0:${String(seconds).padStart(2, '0')} / 0:30`;
}

const RING_DOTS = 30;
const RING_SIZE = 124;
const RING_RADIUS = 56;
const DOT = 6;

/** A calm ring of 30 dots, one per second, that fills clockwise while recording. No countdown. */
function ProgressRing({
  elapsedMs,
  lit,
  unlit,
}: {
  elapsedMs: number;
  lit: string;
  unlit: string;
}) {
  const filled = Math.min(RING_DOTS, Math.floor(elapsedMs / 1000));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: RING_DOTS }, (_, i) => {
        const angle = (i / RING_DOTS) * 2 * Math.PI - Math.PI / 2;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                left: RING_SIZE / 2 + RING_RADIUS * Math.cos(angle) - DOT / 2,
                top: RING_SIZE / 2 + RING_RADIUS * Math.sin(angle) - DOT / 2,
                backgroundColor: i < filled ? lit : unlit,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function ReelRecorder({
  visible,
  onClose,
  onRecorded,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  onRecorded: (clip: RecordedReel) => void;
  onError: (message: string) => void;
}) {
  const { radius, spacing, stage } = useTheme();
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  /** Set when the sheet is closed mid-recording: that clip is thrown away, not posted. */
  const discard = useRef(false);
  const [cameraPermission, askCamera] = useCameraPermissions();
  const [microphonePermission, askMicrophone] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stopClock = () => {
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  };
  const stopRecording = () => {
    if (recording) camera.current?.stopRecording();
  };

  useEffect(() => {
    mounted.current = true;
    const node = camera;
    return () => {
      mounted.current = false;
      discard.current = true;
      stopClock();
      // Stop the hardware on unmount; the in-flight recordAsync result is discarded above.
      node.current?.stopRecording();
    };
  }, []);

  const close = () => {
    if (recording) {
      discard.current = true;
      camera.current?.stopRecording();
    }
    onClose();
  };

  if (Platform.OS === 'web') return null;
  const allowed = !!cameraPermission?.granted && !!microphonePermission?.granted;
  const canAskAgain =
    cameraPermission?.canAskAgain !== false && microphonePermission?.canAskAgain !== false;

  const requestPermissions = async () => {
    const [cameraResult, microphoneResult] = await Promise.all([askCamera(), askMicrophone()]);
    if (!cameraResult.granted || !microphoneResult.granted)
      onError('Camera and microphone access is needed to record a reel.');
  };
  const begin = async () => {
    if (!camera.current || !ready || recording) return;
    setRecording(true);
    startedAt.current = Date.now();
    setElapsed(0);
    interval.current = setInterval(() => {
      if (mounted.current) setElapsed(Math.min(30_000, Date.now() - startedAt.current));
    }, 200);
    try {
      discard.current = false;
      const result = await camera.current.recordAsync({ maxDuration: 30 });
      if (discard.current || !mounted.current) {
        stopClock();
        return;
      }
      const durationMs = Math.min(30_000, Math.max(0, Date.now() - startedAt.current));
      stopClock();
      if (mounted.current) setRecording(false);
      if (!result?.uri) return;
      if (durationMs < 1_000) {
        onError('Hold on a little longer — reels need at least a second.');
        return;
      }
      onRecorded({ uri: result.uri, durationMs });
      onClose();
    } catch (error) {
      stopClock();
      if (mounted.current) setRecording(false);
      if (discard.current || !mounted.current) return;
      if (__DEV__) console.warn('reel recording failed:', error);
      onError('We could not record that reel. Please try again.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <View style={[styles.root, { backgroundColor: stage.bg }]}>
        {allowed ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="video"
            videoQuality="720p"
            onCameraReady={() => setReady(true)}
            onMountError={() => onError('We could not start the camera. Please try again.')}
          />
        ) : (
          <View style={[styles.permission, { padding: spacing.xxl, gap: spacing.lg }]}>
            <Text variant="headline" style={{ color: stage.text, textAlign: 'center' }}>
              {brand.appName} needs your camera and microphone to record a reel.
            </Text>
            <Button
              title={canAskAgain ? 'Allow' : 'Open Settings'}
              onPress={() => void (canAskAgain ? requestPermissions() : Linking.openSettings())}
            />
          </View>
        )}
        <View style={[styles.top, { padding: spacing.lg }]}>
          <IconButton icon="close" label="Close recorder" onPress={close} onMedia />
          <IconButton
            icon="camera-reverse-outline"
            label="Flip camera"
            onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))}
            disabled={recording || !allowed}
            onMedia
          />
        </View>
        {allowed ? (
          <View style={[styles.controls, { padding: spacing.xxl, gap: spacing.md }]}>
            <Text variant="callout" style={[styles.elapsed, { color: stage.text }]}>
              {elapsedLabel(elapsed)}
            </Text>
            <View style={styles.ringBox}>
              <ProgressRing elapsedMs={elapsed} lit={stage.primary} unlit={stage.border} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
                accessibilityState={{ disabled: !ready }}
                disabled={!ready}
                onPress={() => (recording ? stopRecording() : void begin())}
                style={[
                  styles.recordOuter,
                  { borderColor: stage.primary, opacity: ready ? 1 : 0.5 },
                ]}
              >
                <View
                  style={[
                    styles.recordInner,
                    {
                      backgroundColor: recording ? stage.primary : stage.text,
                      borderRadius: recording ? radius.sm : radius.pill,
                    },
                  ]}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  elapsed: { fontVariant: ['tabular-nums'] },
  recordOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: { width: 62, height: 62 },
  ringBox: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
});
