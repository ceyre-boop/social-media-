import type { Ionicons } from '@expo/vector-icons';

import type { Visibility } from '@/lib/posts';

type Meta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One-line explanation shown under the picker. */
  explain: string;
};

export const VISIBILITY_META: Record<Visibility, Meta> = {
  public: { label: 'Public', icon: 'globe-outline', explain: 'Anyone on Smiley' },
  followers: {
    label: 'Followers',
    icon: 'people-outline',
    explain: 'People who keep coming back to you',
  },
  friends: {
    label: 'Friends',
    icon: 'people-circle-outline',
    explain: 'People you both return to',
  },
  private: { label: 'Only me', icon: 'lock-closed-outline', explain: 'Just you' },
};

export const VISIBILITY_ORDER: Visibility[] = ['public', 'followers', 'friends', 'private'];
