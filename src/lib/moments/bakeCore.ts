/**
 * Renders a camera effect into the photo pixels with Skia, offscreen, and encodes a new JPEG.
 * Imported lazily (see bake.ts / bake.web.ts): on web, CanvasKit must be loaded first.
 */
import { BlendMode, ImageFormat, Skia } from '@shopify/react-native-skia';

import { GRAIN_SKSL, type CameraEffect } from './effects';

export type Baked = { base64: string; width: number; height: number };

export async function bakeWithSkia(uri: string, effect: CameraEffect): Promise<Baked> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('camera effect: could not decode photo');
  const width = image.width();
  const height = image.height();
  const surface = Skia.Surface.Make(width, height) ?? Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('camera effect: no surface');
  const canvas = surface.getCanvas();
  const rect = Skia.XYWHRect(0, 0, width, height);

  const paint = Skia.Paint();
  if (effect.matrix) paint.setColorFilter(Skia.ColorFilter.MakeMatrix(effect.matrix));
  canvas.drawImageRect(image, rect, rect, paint);

  if (effect.grain > 0) {
    const grain = Skia.RuntimeEffect.Make(GRAIN_SKSL);
    if (grain) {
      const g = Skia.Paint();
      g.setShader(grain.makeShader([Math.random() * 1000]));
      g.setBlendMode(BlendMode.Overlay);
      g.setAlphaf(0.18 * effect.grain);
      canvas.drawRect(rect, g);
    }
  }
  surface.flush();
  const out = surface.makeImageSnapshot();
  const base64 = out.encodeToBase64(ImageFormat.JPEG, 88);
  return { base64, width, height };
}
