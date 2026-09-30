import type { Ionicons } from '@expo/vector-icons';

import { brand } from '@/config/brand';
import type { Visibility } from '@/lib/posts';

type Meta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One-line explanation shown under the picker. */
  explain: string;
};

export const VISIBILITY_META: Record<Visibility, Meta> = {
  public: { label: 'Public', icon: 'globe-outline', explain: `Anyone on ${brand.appName}` },
  followers: {
    label: 'Followers',
    icon: 'people-outline',
    explain: 'People who follow you or keep coming back',
  },
  friends: {
    label: 'Regulars',
    icon: 'heart-outline',
    explain: 'People you both keep coming back to (not the same as friends you add)',
  },
  private: { label: 'Only me', icon: 'lock-closed-outline', explain: 'Just you' },
};

export const VISIBILITY_ORDER: Visibility[] = ['public', 'followers', 'friends', 'private'];
