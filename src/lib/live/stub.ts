/** Sample data for the live shell. Nothing here touches the network. */
import { ANCHOR_NAMES } from '@/components/gifts/anchor/types';
import type { AnchorName, AnchorSample } from '@/components/gifts/anchor/types';
import type { BrandColorName } from '@/lib/theme';

export type LiveHost = { username: string; displayName: string };

export type LiveStream = {
  id: string;
  host: LiveHost;
  title: string;
  category: string;
  startedMinutesAgo: number;
  viewerCount: number;
  /** Two brand color tokens for the thumbnail gradient. */
  gradient: readonly [BrandColorName, BrandColorName];
};

export const STUB_STREAMS: LiveStream[] = [
  {
    id: 'sunrise-yoga',
    host: { username: 'maya.moves', displayName: 'Maya Okafor' },
    title: 'Sunrise yoga flow, all levels',
    category: 'Wellness',
    startedMinutesAgo: 24,
    viewerCount: 1243,
    gradient: ['tangerine', 'magenta'],
  },
  {
    id: 'lofi-sketching',
    host: { username: 'inkandpaper', displayName: 'Noor Haddad' },
    title: 'Lo-fi sketching, come doodle along',
    category: 'Art',
    startedMinutesAgo: 71,
    viewerCount: 486,
    gradient: ['violet', 'sky'],
  },
  {
    id: 'sourdough',
    host: { username: 'crumbcollective', displayName: 'Theo Marchetti' },
    title: 'Sourdough from scratch: shaping day',
    category: 'Food',
    startedMinutesAgo: 8,
    viewerCount: 312,
    gradient: ['sun', 'tangerine'],
  },
  {
    id: 'garden-tour',
    host: { username: 'greenthumb.jo', displayName: 'Jo Lindqvist' },
    title: 'Balcony garden tour and Q&A',
    category: 'Home',
    startedMinutesAgo: 43,
    viewerCount: 97,
    gradient: ['lime', 'sky'],
  },
  {
    id: 'piano-requests',
    host: { username: 'keys.by.ana', displayName: 'Ana Ribeiro' },
    title: 'Piano requests, sing along welcome',
    category: 'Music',
    startedMinutesAgo: 105,
    viewerCount: 2810,
    gradient: ['magenta', 'violet'],
  },
  {
    id: 'retro-games',
    host: { username: 'pixelpete', displayName: 'Pete Anders' },
    title: 'Retro platformers, no spoilers please',
    category: 'Gaming',
    startedMinutesAgo: 16,
    viewerCount: 654,
    gradient: ['sky', 'violet'],
  },
  {
    id: 'knit-night',
    host: { username: 'wool.and.whimsy', displayName: 'Sam Whitlock' },
    title: 'Cozy knit night: cardigan progress',
    category: 'Crafts',
    startedMinutesAgo: 58,
    viewerCount: 205,
    gradient: ['pink', 'maroon'],
  },
  {
    id: 'language-cafe',
    host: { username: 'polyglot.lea', displayName: 'Léa Dubois' },
    title: 'Language café: easy Spanish chat',
    category: 'Learning',
    startedMinutesAgo: 33,
    viewerCount: 148,
    gradient: ['lime', 'tangerine'],
  },
];

export function findStream(id: string | undefined): LiveStream | undefined {
  return STUB_STREAMS.find((s) => s.id === id);
}

export type ChatMessage = { id: string; username: string; displayName: string; text: string };

export const STUB_CHAT: ChatMessage[] = [
  { id: 'c1', username: 'bea_reads', displayName: 'Bea', text: 'Good morning everyone!' },
  { id: 'c2', username: 'tomo', displayName: 'Tomo', text: 'This is such a nice way to start the day' },
  { id: 'c3', username: 'priya.k', displayName: 'Priya', text: 'Hi from Toronto' },
  { id: 'c4', username: 'dan_the_man', displayName: 'Dan', text: 'Loving the setup today' },
  { id: 'c5', username: 'wren', displayName: 'Wren', text: 'Can you show that part again?' },
  { id: 'c6', username: 'ollie', displayName: 'Ollie', text: 'First time here, this is lovely' },
  { id: 'c7', username: 'marguerite', displayName: 'Marguerite', text: 'Thank you for sharing this' },
];

/** Messages that arrive one at a time in the viewer so the chat feels alive. */
export const STUB_INCOMING: ChatMessage[] = [
  { id: 'i1', username: 'juno', displayName: 'Juno', text: 'Just joined, what did I miss?' },
  { id: 'i2', username: 'bea_reads', displayName: 'Bea', text: 'Welcome Juno!' },
  { id: 'i3', username: 'kofi', displayName: 'Kofi', text: 'Sending good vibes from Accra' },
  { id: 'i4', username: 'lu', displayName: 'Lu', text: 'Best stream of the week' },
];

export type ParticipantRole = 'host' | 'co-host' | 'guest' | 'viewer';

export type Participant = {
  username: string;
  displayName: string;
  role: ParticipantRole;
};

export const ROLE_LABEL: Record<ParticipantRole, string> = {
  host: 'Host',
  'co-host': 'Co-host',
  guest: 'Guest',
  viewer: 'Viewer',
};

export function participantsFor(stream: LiveStream): Participant[] {
  return [
    { ...stream.host, role: 'host' },
    { username: 'cass.and.co', displayName: 'Cass Ellery', role: 'co-host' },
    { username: 'ravi_makes', displayName: 'Ravi Menon', role: 'guest' },
    { username: 'bea_reads', displayName: 'Bea', role: 'viewer' },
    { username: 'tomo', displayName: 'Tomo', role: 'viewer' },
    { username: 'priya.k', displayName: 'Priya', role: 'viewer' },
    { username: 'wren', displayName: 'Wren', role: 'viewer' },
    { username: 'ollie', displayName: 'Ollie', role: 'viewer' },
  ];
}

// ---------------------------------------------------------------------------
// Stub anchor stream (Mode B). The real thing is published by the creator's device.
// ---------------------------------------------------------------------------

/** Simulated lag of the video behind the metadata channel (the spec says 2-10s). */
export const STUB_VIDEO_DELAY_MS = 3000;
/** Publish rate (the spec says 10-15 Hz). */
export const STUB_ANCHOR_HZ = 12;

/** Body offsets from the body center, in normalized frame units, before scaling by `s`. */
const BODY_OFFSETS: Record<AnchorName, { dx: number; dy: number }> = {
  crown: { dx: 0, dy: -0.19 },
  face: { dx: 0, dy: -0.12 },
  chest: { dx: 0, dy: 0.0 },
  hands: { dx: 0.13, dy: 0.11 },
  shoulder_l: { dx: -0.11, dy: -0.06 },
  shoulder_r: { dx: 0.11, dy: -0.06 },
};

/**
 * Where the (imaginary) creator's body is in the frame captured at `pts`: a gentle sway.
 * `sway` 0 holds still (reduced motion).
 */
export function stubBodyAt(pts: number, sway = 1): { cx: number; cy: number; s: number } {
  return {
    cx: 0.5 + 0.07 * Math.sin(pts / 2300) * sway,
    cy: 0.44 + 0.02 * Math.sin(pts / 1900 + 1) * sway,
    s: 1 + 0.07 * Math.sin(pts / 4300) * sway,
  };
}

/**
 * The anchor sample the creator's device would publish for the frame captured at `pts`.
 * Hands dip below the confidence threshold for two seconds every ten, so the fallback chain
 * is exercised in the preview.
 */
export function stubAnchorSampleAt(pts: number, sway = 1): AnchorSample {
  const body = stubBodyAt(pts, sway);
  const handsLost = pts % 10000 > 6500 && pts % 10000 < 8500;
  const conf: Record<AnchorName, number> = {
    crown: 0.94,
    face: 0.94,
    chest: 0.81,
    hands: handsLost ? 0.32 : 0.88,
    shoulder_l: 0.77,
    shoulder_r: 0.76,
  };
  const sample: AnchorSample = { pts };
  for (const name of ANCHOR_NAMES) {
    const o = BODY_OFFSETS[name];
    sample[name] = { x: body.cx + o.dx * body.s, y: body.cy + o.dy * body.s, s: body.s, c: conf[name] };
  }
  return sample;
}
