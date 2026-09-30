import type { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

import { giftTier } from '@/lib/theme';
import type { GiftTierName } from '@/lib/theme';

import type { AnchorName } from './anchor/types';
import { GIFT_ICONS } from './icons';

/**
 * Gift Gallery v2: the catalog follows the first 60 illustrated icons (assets/gifts). Mirrors
 * supabase/migrations/20260929000009_gift_gallery_v2.sql: slugs, names, blips, tiers, render
 * modes, anchors, durations and fills must stay identical to it. 100 blips = $1.00. Gifts are
 * gestures, not objects: never a luxury good, vehicle or wealth signifier. Visual only:
 * nothing here charges, counts or records anything.
 */
export type IoniconName = keyof typeof Ionicons.glyphMap;

export type RenderMode = 'rail' | 'anchor' | 'stage' | 'takeover';

export type Gift = {
  /** The catalog slug (also the icon file name). */
  id: string;
  name: string;
  blips: number;
  tier: GiftTierName;
  /** Icon concept: the brief for the illustration. */
  icon: string;
  /** Bundled illustration. Absent for the five placeholder slots, which use `glyph`. */
  art?: ImageSourcePropType;
  /** Placeholder glyph tile for gifts that have no illustration yet. */
  glyph?: IoniconName;
  renderMode: RenderMode;
  anchorPreferred: AnchorName | null;
  anchorFallbacks: AnchorName[];
  durationMs: number;
  /** Stage only: how much of the stage box the subject fills. */
  boxFillPct: number | null;
  /** How far particles and light may spill beyond the box (max 12). */
  bleedPct: number;
  /** 'gifts/<slug>.png', or '' for a placeholder slot (as in the database). */
  iconUrl: string;
  /** Animation asset (Lottie, Rive...). Null: the icon plays with the mode's default motion. */
  assetUrl: string | null;
};

export type TierInfo = {
  id: GiftTierName;
  label: string;
  /** Blip range, as printed in the doc. */
  range: string;
  /** How the gift shows on screen. */
  presence: string;
  /** One warm line for the picker. */
  blurb: string;
  accent: string;
};

export const TIERS: TierInfo[] = [
  {
    id: 'blips',
    label: 'Blips',
    range: '1–9 blips',
    presence: 'Rail card',
    blurb: 'Everyday acknowledgment',
    accent: giftTier.blips.accent,
  },
  {
    id: 'sparks',
    label: 'Sparks',
    range: '10–99 blips',
    presence: 'Rail card with a puff',
    blurb: 'Showing up for someone',
    accent: giftTier.sparks.accent,
  },
  {
    id: 'glows',
    label: 'Glows',
    range: '100–499 blips',
    presence: 'Follows the creator',
    blurb: 'Real support',
    accent: giftTier.glows.accent,
  },
  {
    id: 'bursts',
    label: 'Bursts',
    range: '500–1,999 blips',
    presence: 'Center stage',
    blurb: 'Big moments',
    accent: giftTier.bursts.accent,
  },
  {
    id: 'showers',
    label: 'Showers',
    range: '2,000–9,999 blips',
    presence: 'Center stage, bigger',
    blurb: 'Spectacle',
    accent: giftTier.showers.accent,
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    range: '10,000 blips',
    presence: 'Takeover',
    blurb: 'Two only, deliberately',
    accent: giftTier.sunrise.accent,
  },
];

/** Stage fill and duration by blips band (spec, Mode C; migration 009). */
function stageFill(b: number): number {
  return b < 1000 ? 45 : b < 2000 ? 60 : b < 5000 ? 75 : 90;
}
function stageMs(b: number): number {
  return b < 1000 ? 3000 : b < 2000 ? 3200 : b < 5000 ? 3600 : 4000;
}

/** Placeholder glyph tiles for the five slots that have no illustration yet. */
const PLACEHOLDER_GLYPH: Record<string, IoniconName> = {
  'long-hug': 'heart-circle',
  'standing-ovation': 'people-circle',
  'northern-lights': 'pulse',
  constellation: 'star-outline',
  'the-whole-sky': 'partly-sunny-outline',
};

function base(slug: string, name: string, blips: number, tier: GiftTierName, concept: string) {
  const art = GIFT_ICONS[slug];
  return {
    id: slug,
    name,
    blips,
    tier,
    icon: concept,
    art,
    glyph: art ? undefined : (PLACEHOLDER_GLYPH[slug] ?? 'gift'),
    bleedPct: 12,
    iconUrl: art ? `gifts/${slug}.png` : '',
    assetUrl: null,
  };
}

function rail(
  tier: 'blips' | 'sparks',
  slug: string,
  name: string,
  blips: number,
  ms: number,
  concept: string,
): Gift {
  return {
    ...base(slug, name, blips, tier, concept),
    renderMode: 'rail',
    anchorPreferred: null,
    anchorFallbacks: [],
    durationMs: ms,
    boxFillPct: null,
  };
}

function glow(
  slug: string,
  name: string,
  blips: number,
  ms: number,
  anchor: AnchorName,
  fallbacks: AnchorName[],
  concept: string,
): Gift {
  return {
    ...base(slug, name, blips, 'glows', concept),
    renderMode: 'anchor',
    anchorPreferred: anchor,
    anchorFallbacks: fallbacks,
    durationMs: ms,
    boxFillPct: null,
  };
}

function stage(
  tier: 'bursts' | 'showers',
  slug: string,
  name: string,
  blips: number,
  concept: string,
): Gift {
  return {
    ...base(slug, name, blips, tier, concept),
    renderMode: 'stage',
    anchorPreferred: null,
    anchorFallbacks: [],
    durationMs: stageMs(blips),
    boxFillPct: stageFill(blips),
  };
}

function takeover(slug: string, name: string, concept: string): Gift {
  return {
    ...base(slug, name, 10000, 'sunrise', concept),
    renderMode: 'takeover',
    anchorPreferred: null,
    anchorFallbacks: [],
    durationMs: 6000,
    boxFillPct: null,
  };
}

export const GIFTS: Gift[] = [
  // Blips (1-9): rail, 1.2s
  rail('blips', 'smile', 'Smile', 1, 1200, 'Yellow smiley face'),
  rail('blips', 'heart', 'Heart', 1, 1200, 'Warm red heart'),
  rail('blips', 'sparkle', 'Sparkle', 2, 1200, 'Scatter of gold stars'),
  rail('blips', 'daisy', 'Daisy', 2, 1200, 'White daisy, yellow center'),
  rail('blips', 'tulip', 'Tulip', 3, 1200, 'Single pink tulip'),
  rail('blips', 'cherries', 'Cherries', 3, 1200, 'Pair of cherries on a stem'),
  rail('blips', 'strawberry', 'Strawberry', 5, 1200, 'Ripe strawberry'),
  rail('blips', 'lucky-clover', 'Lucky Clover', 5, 1200, 'Four-leaf clover'),
  rail('blips', 'paper-plane', 'Paper Plane', 7, 1200, 'Folded paper plane'),
  rail('blips', 'heart-shades', 'Heart Shades', 7, 1200, 'Heart-shaped sunglasses'),
  rail('blips', 'lemon-drop', 'Lemon Drop', 9, 1200, 'Lemon with a leaf'),
  rail('blips', 'popcorn', 'Popcorn', 9, 1200, 'Striped popcorn bucket'),

  // Sparks (10-99): rail, 1.6-2s
  rail('sparks', 'warm-mug', 'Warm Mug', 10, 1600, 'Steaming blue mug'),
  rail('sparks', 'good-morning', 'Good Morning', 15, 1600, 'Bright sun with rays'),
  rail('sparks', 'goodnight', 'Goodnight', 15, 1600, 'Crescent moon and stars'),
  rail('sparks', 'just-peachy', 'Just Peachy', 20, 1600, 'Peach with leaves'),
  rail('sparks', 'watermelon-slice', 'Watermelon Slice', 25, 1600, 'Watermelon wedge'),
  rail('sparks', 'avocado', 'Better Together', 30, 1600, 'Avocado halves'),
  rail('sparks', 'cupcake', 'Cupcake', 35, 1600, 'Cupcake with a cherry'),
  rail('sparks', 'polaroid', 'Polaroid', 40, 1600, 'Instant photo, sunny hill'),
  rail('sparks', 'snapshot', 'Snapshot', 45, 1600, 'Teal camera'),
  rail('sparks', 'playlist-for-you', 'Playlist For You', 50, 1800, 'Floating music notes'),
  rail('sparks', 'headphones', 'Good Listener', 55, 1800, 'Blue headphones'),
  rail('sparks', 'player-two', 'Player Two', 60, 1800, 'Purple game controller'),
  rail('sparks', 'pencil', 'Take Notes', 75, 2000, 'Yellow pencil'),
  rail('sparks', 'love-letter', 'Love Letter', 99, 2000, 'Envelope sealed with a heart'),

  // Glows (100-499): anchored to the creator
  glow('youre-a-star', "You're a Star", 100, 2400, 'crown', ['face', 'chest'], 'Purple star'),
  glow('little-gift', 'Little Gift', 120, 2400, 'hands', ['chest'], 'Wrapped gift with a bow'),
  glow('bright-idea', 'Bright Idea', 150, 2400, 'crown', ['face'], 'Glowing light bulb'),
  glow('story-time', 'Story Time', 175, 2400, 'hands', ['chest'], 'Open book'),
  glow(
    'book-stack',
    'Book Stack',
    200,
    2600,
    'hands',
    ['chest', 'shoulder_r'],
    'Stack of three books',
  ),
  glow('seashell', 'Seashell', 225, 2600, 'hands', ['chest'], 'Pink scallop shell'),
  glow('starfish', 'Starfish', 250, 2600, 'chest', ['hands'], 'Orange starfish'),
  glow('cactus-hug', 'Cactus Hug', 275, 2800, 'chest', ['hands'], 'Friendly green cactus'),
  glow(
    'balloon-bundle',
    'Balloon Bundle',
    300,
    2800,
    'shoulder_l',
    ['shoulder_r', 'crown'],
    'Three balloons',
  ),
  glow('bouquet', 'Bouquet', 325, 2800, 'hands', ['chest', 'shoulder_r'], 'Wrapped flower bouquet'),
  glow('hype-horn', 'Hype Horn', 350, 2800, 'shoulder_r', ['shoulder_l', 'face'], 'Pink megaphone'),
  glow('action', 'Action!', 400, 3000, 'shoulder_r', ['shoulder_l', 'chest'], 'Film clapperboard'),
  glow('disco-ball', 'Disco Ball', 450, 3000, 'crown', ['face'], 'Mirror ball with sparkles'),
  glow('long-hug', 'Long Hug', 499, 3000, 'chest', ['hands'], 'Two figures, arms fully wrapped'),

  // Bursts (500-1,999) and Showers (2,000-9,999): center stage
  stage('bursts', 'fireworks', 'Fireworks', 500, 'Firework burst'),
  stage('bursts', 'party-popper', 'Party Popper', 600, 'Party popper with streamers'),
  stage('bursts', 'rainbow', 'Rainbow', 750, 'Rainbow between clouds'),
  stage('bursts', 'birthday-cake', 'Birthday Cake', 900, 'Layer cake with candles'),
  stage('bursts', 'campfire', 'Campfire', 1000, 'Crackling campfire'),
  stage('bursts', 'palm-tree', 'Palm Tree', 1200, 'Palm tree'),
  stage('bursts', 'big-wave', 'Big Wave', 1400, 'Curling ocean wave'),
  stage('bursts', 'campout', 'Campout', 1600, 'Tent'),
  stage('bursts', 'forest-walk', 'Forest Walk', 1800, 'Pine trees'),
  stage('bursts', 'standing-ovation', 'Standing Ovation', 1999, 'Row of figures rising, hands up'),
  stage('showers', 'mountain-top', 'Mountain Top', 2000, 'Snowy mountains'),
  stage('showers', 'treasure-map', 'Treasure Map', 2500, 'Folded map with a pin'),
  stage('showers', 'true-north', 'True North', 3000, 'Compass'),
  stage('showers', 'island-day', 'Island Day', 4000, 'Island with palms and sun'),
  stage('showers', 'main-stage', 'Main Stage', 5000, 'Stage with a disco ball'),
  stage('showers', 'whole-world', 'Whole World', 6000, 'Globe'),
  stage('showers', 'northern-lights', 'Northern Lights', 7500, 'Aurora ribbons over a ridge'),
  stage('showers', 'constellation', 'Constellation', 9999, 'Connected stars forming a smile'),

  // Sunrise (10,000): takeover
  takeover('sunrise', 'Sunrise', 'Sun rising over the sea'),
  takeover('the-whole-sky', 'The Whole Sky', 'Sky in every color, ground silhouette'),
];

export function giftsInTier(tier: GiftTierName): Gift[] {
  return GIFTS.filter((x) => x.tier === tier);
}

export function findGift(id: string): Gift | undefined {
  return GIFTS.find((x) => x.id === id);
}

export function tierInfo(tier: GiftTierName): TierInfo {
  return TIERS.find((t) => t.id === tier) ?? TIERS[0];
}

export function tierAccent(tier: GiftTierName): string {
  return giftTier[tier].accent;
}

/** "1 blip", "1,200 blips". The rate is published openly: 100 blips = $1.00. */
export function formatBlips(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'blip' : 'blips'}`;
}

export const BLIP_RATE = '100 blips = $1.00';
