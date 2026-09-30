# Smiley — Gift Render Spec v1

How gifts appear on screen. Placement, sizing, anchoring, and concurrency.

Pairs with `gift-gallery.md`. **Animations themselves are not specified here** — this
defines the stage they play on, so assets can be produced later against a fixed
contract.

---

## Four render modes

Every gift declares exactly one.

| Mode | Tiers | Screen presence | Duration |
|---|---|---|---|
| **A — Rail** | Blips, Sparks (1–99) | Stacked cards, right rail | 1.2–2s |
| **B — Anchor** | Glows (100–499) | Tracked to the creator's body | 2–3s |
| **C — Stage** | Bursts, Showers (500–9,999) | Bounded center region | 3–4s |
| **D — Takeover** | Sunrise (10,000) | Near-full screen | 6s |

---

## Safe areas

Percentages of the live viewport. Nothing in any mode may cover these.

| Zone | Region | Contains |
|---|---|---|
| **Top guard** | 0–14% | Creator header, viewer count, close |
| **Bottom guard** | 72–100% | Chat, composer, gift button |
| **Side gutters** | 16pt each edge | — |

**Stage box** (mode C): x from 16pt to width−16pt, y from 18% to 68%.

**Content vs bleed.** The recognizable subject stays inside the box. Particles,
glow, light spill and motion trails may bleed up to **12% beyond** the box on any
edge — that's the breathing room, and it's what keeps big gifts from looking boxed
in. Bleed may enter the guards but must never be opaque there: max 40% alpha over a
guard zone, and never over the close button or composer.

**Takeover** (mode D) may cover everything except the top 10% and bottom 12%. The
close button and composer stay reachable at all times, in every mode, without
exception.

---

## Mode A — Rail

Stacked cards on the right, above the bottom guard, rising and fading.

- Card: 48pt icon, sender avatar, sender name, gift name, combo count
- Max **4 visible**; a fifth pushes the oldest out early
- New cards enter from bottom, stack upward
- Sparks (10–99) get a small particle puff on entry; Blips do not

**Combos.** The same gift from the same sender within 3s increments a counter on
the existing card rather than creating a new one. Counter scales and pulses; the
3s window resets on each send. This is what makes rapid small gifting feel good
instead of spammy, and it's the single highest-value detail in this mode.

---

## Mode B — Anchor

The gift attaches to the creator's body and moves with them.

### Anchor points

`crown` (above head) · `face` · `chest` · `hands` · `shoulder_l` · `shoulder_r`

Each gift declares a preferred anchor and an ordered fallback list.

### Architecture — broadcaster-side detection

Detection runs on the **creator's device**, on the raw camera frame before
encoding. It publishes anchor coordinates as stream metadata. Viewers consume
coordinates and place a sprite.

Never run detection on viewer devices. It multiplies the same work by the viewer
count, drains battery, and causes thermal throttling that degrades playback — the
thing viewers actually care about.

Publish at **10–15 Hz**, interpolate between samples client-side.

### Timestamp synchronization — required

Video arrives 2–10s behind the metadata channel depending on transport. Placing a
sprite at the coordinates just received puts it where the creator *was*.

Every anchor sample carries the **presentation timestamp of the frame it was
computed from**. Viewers buffer samples and match to the currently displayed
frame's PTS. Without this, anchored gifts float visibly off-target and the whole
mode looks broken.

Anchor payload:

```json
{
  "pts": 1727661234567,
  "crown":      { "x": 0.51, "y": 0.18, "s": 1.0, "c": 0.94 },
  "face":       { "x": 0.50, "y": 0.31, "s": 1.0, "c": 0.94 },
  "chest":      { "x": 0.50, "y": 0.52, "s": 1.0, "c": 0.81 },
  "shoulder_l": { "x": 0.38, "y": 0.44, "s": 1.0, "c": 0.77 },
  "shoulder_r": { "x": 0.62, "y": 0.44, "s": 1.0, "c": 0.76 }
}
```

`x`/`y` normalized 0–1. `s` is scale relative to a reference body size, so the
sprite grows as the creator moves toward the camera. `c` is detection confidence.

### Fallback chain

1. Preferred anchor, confidence ≥ 0.6 → place and track
2. Next fallback anchor meeting threshold
3. No anchor available → **degrade to Mode A (Rail)**, at full Glow card size

Mid-animation loss of tracking: hold the last known position for 400ms, then ease
to the stage center rather than snapping. Never let a sprite jump.

### Multi-creator layouts

See the Battle Mode section below — battles change enough that they get their own
rules.

---

## Battle mode

In a battle the screen is divided into tiles, and **a gift is a point**. That
changes two things fundamentally: an animation that covers the whole screen now
hides the competition at the exact moment it's most interesting, and any ambiguity
about who received a gift is a functional bug rather than a cosmetic one.

### Layouts

| Participants | Layout |
|---|---|
| 2 | Split — side by side, or stacked in portrait |
| 3 | One large tile, two stacked |
| 4 | One large tile, three stacked, or even 2×2 |

Each tile carries its own anchor metadata stream.

### Additional guard zone

The **score bar** across the top of the battle region is a permanent guard. Nothing
renders over it, in any mode, at any alpha. It's the thing everyone is watching.

### Mode changes in battle

| Normal mode | In battle | Behavior |
|---|---|---|
| **A — Rail** | **Tile Rail** | Mini cards inside the recipient's tile, max 2 visible, 32pt icon |
| **B — Anchor** | **Tile Anchor** | Unchanged, but clipped to tile bounds; sprite scales to tile size |
| **C — Stage** | **Tile Burst** | Bounded to the recipient's tile, max 80% fill, bleeds 8% into the surrounding frame but never into another tile or the score bar |
| **D — Takeover** | **Flash-and-Collapse** | 1.2s full-screen flash, then collapses into the recipient's tile and finishes there. Total 4s, not 6 |

**Full-screen Stage and Takeover are disabled in battle.** The competition stays
visible throughout. Flash-and-Collapse preserves the moment a 10,000 lands —
everyone sees it, nobody loses the board.

### Attribution is mandatory

Because a gift is a point, every battle gift must make the recipient unmistakable:

1. **Recipient tile border pulses** in the gift's dominant color for the animation's
   duration
2. **All animation geometry originates from inside the recipient's tile** — nothing
   drifts across tile boundaries
3. Tile Rail cards sit in the recipient's tile, never a shared rail
4. Score increments animate on the recipient's tile, not centrally

If a viewer can't tell in under half a second who a gift went to, the render is
wrong.

### Concurrency in battle

Per-tile queues, not one global queue. Four creators can each have an animation
playing simultaneously — that's the format working, not a collision.

- One Tile Anchor or Tile Burst per tile at a time
- Tile Rail runs alongside
- Flash-and-Collapse is the exception: it takes the global lock for its 1.2s flash,
  then releases and finishes inside its tile
- Per-tile queue depth 4; overflow degrades to Tile Rail, still fully credited

### Small-tile degradation

In a 4-way layout a stacked tile may be under 180pt tall. Below that threshold:

- Tile Anchor downgrades to Tile Rail — detection is unreliable and a sprite at
  that scale is illegible
- Tile Burst caps at 60% fill
- Tile Rail shows 1 card

### Unresolved

Battle scoring is **not decided** — the open question is whether battles score by
gift value or by distinct gifters (see `milestone-2-brief.md` §4). That decision
changes what the score bar displays and whether a single large gift should get a
visually dominant treatment at all. **Build battle rendering only after scoring is
settled.**

---

## Mode C — Stage

Bounded center region, per the stage box above. Size scales with value:

| Blips | Box fill | Duration |
|---|---|---|
| 500–999 | 45% | 3.0s |
| 1,000–1,999 | 60% | 3.2s |
| 2,000–4,999 | 75% | 3.6s |
| 5,000–9,999 | 90% | 4.0s |

Chat stays fully legible throughout — stage never enters the bottom guard at more
than 40% alpha.

---

## Mode D — Takeover

10,000 only. 6 seconds, near-full screen, one per stream per 60 seconds regardless
of how many are sent. Overflow queues.

Sender's name and avatar are shown prominently. This is the one place the sender is
foregrounded rather than the gift.

---

## Concurrency and queueing

The failure mode to avoid is five simultaneous animations turning the screen into
noise — which is what incumbent live gifting looks like in practice.

**Rules:**

1. **One Anchor, Stage, or Takeover animation at a time.** Rail runs concurrently
   with any of them.
2. Higher value **preempts nothing** — it queues. A gift already playing always
   finishes. Interrupting an animation someone paid for feels like theft.
3. Queue is **value-ordered**, then FIFO within equal value.
4. Queue depth 8. Beyond that, overflow gifts render as Rail cards and are still
   fully credited — the ledger never depends on whether an animation played.
5. **Maximum 70% of any 60-second window** may be occupied by Stage or Takeover.
   Past that, overflow degrades to Rail until the window clears. Without this cap,
   a busy stream becomes unwatchable and the creator disappears behind their own
   gifts.
6. Rail is capped at 4 visible regardless of inbound rate.

---

## Viewer controls

Required, not optional. Some people find heavy motion unpleasant or
migraine-triggering, and "everyone leaves feeling better" has to include them.

| Setting | Effect | Default |
|---|---|---|
| **Full** | Everything as specified | on |
| **Calm** | Anchor and Stage play at 50% scale, no full takeover, no particles | — |
| **Minimal** | All gifts render as Rail cards only | — |

Honor the OS reduce-motion setting by defaulting to **Calm** when it's enabled.

Creators get a separate toggle to cap incoming animation size on their own stream.

---

## Data model

Add to `gift_catalog`:

```sql
alter table gift_catalog
  add column render_mode      text not null default 'rail',
        -- 'rail' | 'anchor' | 'stage' | 'takeover'
  add column anchor_preferred text,
        -- 'crown'|'face'|'chest'|'hands'|'shoulder_l'|'shoulder_r'
  add column anchor_fallbacks text[] default '{}',
  add column duration_ms      integer not null default 1500,
  add column box_fill_pct     smallint,
  add column bleed_pct        smallint default 12,
  add column asset_url        text,
  add column asset_kind       text default 'lottie',
        -- 'lottie' | 'webp' | 'rive' | 'video_alpha'
  add column icon_url         text not null default '';
```

`icon_url` is the static 64pt gallery icon — required for every gift from day one.
`asset_url` is the animation and may be null; a gift with no animation asset
renders its icon in the correct mode with a default motion preset. **Every gift
ships usable before any animation exists.**

---

## Asset production spec

Producing against this contract now avoids reworking assets later.

| Mode | Format | Canvas | Target size |
|---|---|---|---|
| Rail | Lottie or animated WebP | 256×256 | <80 KB |
| Anchor | Lottie, transparent | 512×512 | <200 KB |
| Stage | Lottie or Rive | 1080×1080 | <600 KB |
| Takeover | Rive, or HEVC with alpha | 1080×1920 | <2 MB |

- Transparent background always. No baked-in backdrop.
- **Anchor assets need a declared registration point** — the pixel that sits on the
  anchor coordinate. Center is usually wrong; a crown sits on its base.
- 60fps authoring, 30fps acceptable for Rail.
- Design against both a bright and a dark video background; live rooms are
  usually dark but not reliably so.

---

## Open items

- Sound: whether gifts carry audio, and how it ducks against the creator's mic
- Haptics for the sender on send
- Battle scoring model — blocks battle render implementation
