/**
 * Mode A (Rail) state: stacked cards with combos. Pure: time is passed in.
 *
 * Combos: the same gift from the same sender within COMBO_WINDOW_MS increments the counter on
 * the existing card instead of adding a new one, and the window restarts on every send. If the
 * card has already left the screen but the window is still open, the new card continues the count.
 */
export const COMBO_WINDOW_MS = 3000;
export const RAIL_MAX = 4;

export type GiftSender = { id: string; name: string; username: string };

export type RailCard = {
  id: number;
  giftId: string;
  sender: GiftSender;
  count: number;
  /** Increments on every combo hit: drives the counter pulse. */
  bump: number;
  startedAt: number;
  lastAt: number;
  expiresAt: number;
  durationMs: number;
  /** Sparks get a particle puff on entry; the entry tier does not. */
  puff: boolean;
  /** Full Glow card size (an anchored gift that degraded to the rail). */
  full: boolean;
};

export type RailState = {
  /** Oldest first: new cards enter at the bottom, so the newest is last. */
  cards: RailCard[];
  recent: Record<string, { count: number; lastAt: number }>;
  nextId: number;
};

export type RailInput = {
  giftId: string;
  sender: GiftSender;
  durationMs: number;
  puff: boolean;
  full?: boolean;
};

export const emptyRail: RailState = { cards: [], recent: {}, nextId: 1 };

export const comboKey = (giftId: string, senderId: string) => `${giftId}:${senderId}`;

export function addToRail(state: RailState, input: RailInput, now: number): RailState {
  const key = comboKey(input.giftId, input.sender.id);
  const live = state.cards.find(
    (c) => c.giftId === input.giftId && c.sender.id === input.sender.id && c.expiresAt > now,
  );
  const prior = state.recent[key];
  const inWindow = prior && now - prior.lastAt <= COMBO_WINDOW_MS;

  let cards: RailCard[];
  let count: number;
  let nextId = state.nextId;

  if (live) {
    count = live.count + 1;
    cards = state.cards.map((c) =>
      c === live
        ? {
            ...c,
            count,
            bump: c.bump + 1,
            lastAt: now,
            expiresAt: now + input.durationMs,
            durationMs: input.durationMs,
          }
        : c,
    );
  } else {
    count = inWindow ? prior.count + 1 : 1;
    const card: RailCard = {
      id: nextId++,
      giftId: input.giftId,
      sender: input.sender,
      count,
      bump: 0,
      startedAt: now,
      lastAt: now,
      expiresAt: now + input.durationMs,
      durationMs: input.durationMs,
      puff: input.puff,
      full: input.full ?? false,
    };
    cards = [...state.cards.filter((c) => c.expiresAt > now), card];
    // A fifth card pushes the oldest out early.
    while (cards.length > RAIL_MAX) cards.shift();
  }

  return {
    cards,
    recent: { ...pruneRecent(state.recent, now), [key]: { count, lastAt: now } },
    nextId,
  };
}

function pruneRecent(recent: RailState['recent'], now: number): RailState['recent'] {
  const out: RailState['recent'] = {};
  for (const [k, v] of Object.entries(recent)) {
    if (now - v.lastAt <= COMBO_WINDOW_MS) out[k] = v;
  }
  return out;
}

/** Drop cards whose time is up. */
export function expireRail(state: RailState, now: number): RailState {
  const cards = state.cards.filter((c) => c.expiresAt > now);
  if (cards.length === state.cards.length) return state;
  return { ...state, cards, recent: pruneRecent(state.recent, now) };
}

/** When the next card expires (ms clock), or null if the rail is empty. */
export function nextRailExpiry(state: RailState): number | null {
  if (state.cards.length === 0) return null;
  return Math.min(...state.cards.map((c) => c.expiresAt));
}
