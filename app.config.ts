import type { ExpoConfig } from 'expo/config';

import { brand } from './src/config/brand.ts';

/**
 * `slug` and `scheme` are deliberately name-independent: changing the slug later affects EAS
 * project linkage and OTA updates, and the scheme is baked into deep links. Only the display
 * name and permission copy follow the brand config.
 */
const config: ExpoConfig = {
  name: brand.appName,
  slug: 'social-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'socialapp',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0E0B10',
  android: {
    adaptiveIcon: {
      backgroundColor: '#FCFBF0',
      foregroundImage: './assets/images/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
    backgroundColor: '#0E0B10',
    themeColor: '#0E0B10',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0E0B10',
        image: './assets/images/logo.png',
        imageWidth: 200,
      },
    ],
    'expo-sqlite',
    'expo-video',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission: `${brand.appName} uses the camera so you can record reels.`,
        microphonePermission: `${brand.appName} uses the microphone to record sound with your reels.`,
        recordAudioAndroid: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: `${brand.appName} opens your library so you can share photos and videos.`,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
