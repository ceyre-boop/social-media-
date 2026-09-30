import { StyleSheet, View } from 'react-native';

export const NAV_ICON_SIZE = 24;
const STROKE = 1.5;

/**
 * The Create icon: a plus inside a small outlined rounded square. Drawn to match the Ionicons
 * outline family (same 24px box, same stroke), colored like every other nav icon.
 */
export function CreateGlyph({ color }: { color: string }) {
  return (
    <View style={[styles.box, { borderColor: color }]}>
      <View style={[styles.h, { backgroundColor: color }]} />
      <View style={[styles.v, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: NAV_ICON_SIZE - 2,
    height: NAV_ICON_SIZE - 2,
    borderWidth: STROKE,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h: { position: 'absolute', width: 10, height: STROKE },
  v: { position: 'absolute', width: STROKE, height: 10 },
});
