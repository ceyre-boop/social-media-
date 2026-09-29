import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import type { Visibility } from '@/lib/posts';
import { palettes } from '@/lib/theme';
import { VISIBILITY_META } from '@/lib/visibility';

const c = palettes.dark;

/** Small sheet from the "more" button: who can see this post. Nothing else exists yet. */
export function MoreSheet({
  visible,
  visibility,
  onClose,
}: {
  visible: boolean;
  visibility: Visibility;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const meta = VISIBILITY_META[visibility];
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          accessible={false}
          style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}
          onPress={() => {}}
        >
          <Text style={styles.heading}>Who can see this</Text>
          <View style={styles.row}>
            <Ionicons name={meta.icon} size={24} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{meta.label}</Text>
              <Text style={styles.explain}>{meta.explain}</Text>
            </View>
          </View>
          <Button title="Close" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  heading: { color: c.text, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { color: c.text, fontSize: 16, fontWeight: '700' },
  explain: { color: c.muted, fontSize: 14, marginTop: 2 },
});
