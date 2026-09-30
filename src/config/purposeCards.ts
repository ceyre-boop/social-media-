/**
 * The "what makes this app different" cards shown before sign up. Plain data so the copy is easy
 * to edit. Names come from brand.ts. Keep each card to a headline and one or two sentences.
 */
import type { Ionicons } from '@expo/vector-icons';

import { brand } from '@/config/brand';

export type PurposeCard = {
  icon: keyof typeof Ionicons.glyphMap;
  headline: string;
  body: string;
};

export const purposeCards: PurposeCard[] = [
  {
    icon: 'people-outline',
    headline: 'Built for the real ones',
    body: 'The people you actually come back to. Your Home is them, not a follower count. There are no public counts anywhere.',
  },
  {
    icon: 'moon-outline',
    headline: 'It ends on purpose',
    body: "Feeds finish. When you've seen what's new, you can put your phone down.",
  },
  {
    icon: 'camera-outline',
    headline: `${brand.momentsName}: a look at your real friends`,
    body: `${brand.momentsName} is a little look at what your real friends are actually up to. Friends only, never public.`,
  },
  {
    icon: 'heart-outline',
    headline: 'Kind by design',
    body: 'Say anything you feel. Sadness, anger and grief are always welcome. The only line is cruelty toward a person.',
  },
];
