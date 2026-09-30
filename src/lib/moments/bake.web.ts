/**
 * Web: Skia runs on CanvasKit (WebAssembly, ~7 MB). It is loaded ONLY when someone picks an effect
 * in the Moment composer, never on app start, from jsDelivr pinned to the installed
 * canvaskit-wasm version (keep CANVASKIT_VERSION in step with bun.lock). If it cannot load, the
 * composer falls back to "None" and says so.
 */
import type { CameraEffect } from './effects';
import type { Baked } from './bakeCore';

export type { Baked };

export const effectsAvailable = true;

const CANVASKIT_VERSION = '0.41.0';
let loading: Promise<void> | null = null;

function loadCanvasKit(): Promise<void> {
  loading ??= import('@shopify/react-native-skia/lib/module/web')
    .then(({ LoadSkiaWeb }) =>
      LoadSkiaWeb({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${CANVASKIT_VERSION}/bin/full/${file}`,
      }),
    )
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export async function bakeEffect(uri: string, effect: CameraEffect): Promise<Baked> {
  await loadCanvasKit();
  const { bakeWithSkia } = await import('./bakeCore');
  return bakeWithSkia(uri, effect);
}
