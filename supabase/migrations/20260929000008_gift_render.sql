-- ============================================================================
-- 008 — Gift Gallery v1 + Gift Render Spec v1 (docs/gift-gallery.md,
-- docs/gift-render-spec.md).
--
-- * Render columns on gift_catalog, per the spec's data model, with checks.
-- * tier column (the gallery's six tiers).
-- * The 60 gifts replace the placeholder seed gifts. `coins` holds the price in
--   blips (1 blip = 1 cent); the column name predates the currency name, which
--   is still an open item.
-- * Catalog only: nothing here sells, spends, or writes the ledger.
-- ============================================================================

alter table gift_catalog
  add column tier             text,
  add column render_mode      text not null default 'rail',
  add column anchor_preferred text,
  add column anchor_fallbacks text[] not null default '{}',
  add column duration_ms      integer not null default 1500,
  add column box_fill_pct     smallint,
  add column bleed_pct        smallint not null default 12,
  add column asset_url        text,
  add column asset_kind       text not null default 'lottie',
  add column icon_url         text not null default '',
  add column icon_concept     text;

alter table gift_catalog
  add constraint gift_tier_check
    check (tier in ('blips','sparks','glows','bursts','showers','sunrise')),
  add constraint gift_render_mode_check
    check (render_mode in ('rail','anchor','stage','takeover')),
  add constraint gift_anchor_check
    check (anchor_preferred is null
           or anchor_preferred in ('crown','face','chest','hands','shoulder_l','shoulder_r')),
  add constraint gift_anchor_fallbacks_check
    check (anchor_fallbacks <@ array['crown','face','chest','hands','shoulder_l','shoulder_r']),
  add constraint gift_anchor_mode_check
    check ((render_mode = 'anchor') = (anchor_preferred is not null)),
  add constraint gift_box_fill_check
    check ((render_mode = 'stage') = (box_fill_pct is not null)
           and (box_fill_pct is null or box_fill_pct between 1 and 100)),
  add constraint gift_bleed_check check (bleed_pct between 0 and 12),
  add constraint gift_duration_check check (duration_ms between 500 and 6000),
  add constraint gift_asset_kind_check
    check (asset_kind in ('lottie','webp','rive','video_alpha')),
  -- Render mode follows the tier (spec: "Four render modes").
  add constraint gift_tier_mode_check check (
    (tier in ('blips','sparks') and render_mode = 'rail')
    or (tier = 'glows'   and render_mode = 'anchor')
    or (tier in ('bursts','showers') and render_mode = 'stage')
    or (tier = 'sunrise' and render_mode = 'takeover')),
  -- Price follows the tier (gallery tier bands, in blips).
  add constraint gift_tier_price_check check (
    (tier = 'blips'   and coins between 1 and 9)
    or (tier = 'sparks'  and coins between 10 and 99)
    or (tier = 'glows'   and coins between 100 and 499)
    or (tier = 'bursts'  and coins between 500 and 1999)
    or (tier = 'showers' and coins between 2000 and 9999)
    or (tier = 'sunrise' and coins = 10000));

create unique index gift_catalog_name_key on gift_catalog (lower(name));

-- The placeholder seed gifts (Rose, Coffee…) are superseded. Remove any that
-- have never been sent; gift_events references are append-only and must stay.
delete from gift_catalog g
 where tier is null
   and not exists (select 1 from gift_events e where e.gift_id = g.id);
update gift_catalog set active = false where tier is null;

-- Stage fill/duration by blips band (spec, Mode C).
create function pg_temp.stage_fill(b integer) returns smallint language sql immutable as $$
  select (case when b < 1000 then 45 when b < 2000 then 60 when b < 5000 then 75 else 90 end)::smallint $$;
create function pg_temp.stage_ms(b integer) returns integer language sql immutable as $$
  select case when b < 1000 then 3000 when b < 2000 then 3200 when b < 5000 then 3600 else 4000 end $$;

-- Rail + takeover gifts.
insert into gift_catalog (name, coins, tier, render_mode, duration_ms, icon_concept) values
  ('Wave',               1, 'blips', 'rail', 1200, 'Open hand, mid-wave, motion arc'),
  ('Nod',                1, 'blips', 'rail', 1200, 'Simple face in profile, small arc'),
  ('Smile',              2, 'blips', 'rail', 1200, 'The brand mark itself, no wink'),
  ('Thumbs Up',          2, 'blips', 'rail', 1200, 'Classic, warm yellow'),
  ('Snap Snap',          3, 'blips', 'rail', 1200, 'Fingers snapping, two small bursts'),
  ('Clap',               3, 'blips', 'rail', 1200, 'Two hands, small impact lines'),
  ('Wink',               5, 'blips', 'rail', 1200, 'The brand mark, winking — house gift'),
  ('High Five',          5, 'blips', 'rail', 1200, 'Two palms meeting, yellow flash'),
  ('Heart Hands',        7, 'blips', 'rail', 1200, 'Hands forming a heart'),
  ('Fist Bump',          7, 'blips', 'rail', 1200, 'Two fists, small spark between'),
  ('Chef''s Kiss',       9, 'blips', 'rail', 1200, 'Fingers to lips, sparkle'),
  ('Front Row Seat',     9, 'blips', 'rail', 1200, 'Single folding chair, spotlight'),
  ('Saved You a Seat',  10, 'sparks', 'rail', 1600, 'Chair with a coat over the back'),
  ('Warm Mug',          15, 'sparks', 'rail', 1600, 'Steaming mug, cream and yellow'),
  ('Good Morning',      15, 'sparks', 'rail', 1600, 'Small sun over a horizon line'),
  ('Snack Run',         20, 'sparks', 'rail', 1600, 'Paper bag, snacks peeking out'),
  ('Blanket Fort',      25, 'sparks', 'rail', 1600, 'Draped sheet over two chairs'),
  ('Cheer Squad',       30, 'sparks', 'rail', 1600, 'Three tiny figures, arms up'),
  ('Playlist For You',  35, 'sparks', 'rail', 1600, 'Cassette with a handwritten label'),
  ('Hype Sign',         40, 'sparks', 'rail', 1600, 'Cardboard sign, marker lettering'),
  ('Sticker Pack',      45, 'sparks', 'rail', 1600, 'Loose stickers, one peeling up'),
  ('Umbrella',          50, 'sparks', 'rail', 1800, 'Open umbrella, two raindrops'),
  ('Hold the Light',    55, 'sparks', 'rail', 1800, 'Flashlight beam cutting dark'),
  ('Lucky Penny',       60, 'sparks', 'rail', 1800, 'Single coin, heads up, glint'),
  ('Paper Crane',       75, 'sparks', 'rail', 2000, 'Folded origami crane'),
  ('Long Hug',          99, 'sparks', 'rail', 2000, 'Two figures, arms fully wrapped'),
  ('Sunrise',        10000, 'sunrise', 'takeover', 6000, 'Sun cresting a horizon, full warmth'),
  ('The Whole Sky',  10000, 'sunrise', 'takeover', 6000, 'Sky in every color, ground silhouette');

-- Anchor gifts (Glows): preferred anchor + ordered fallbacks.
insert into gift_catalog (name, coins, tier, render_mode, duration_ms,
                          anchor_preferred, anchor_fallbacks, icon_concept) values
  ('Standing Ovation',   100, 'glows', 'anchor', 2400, 'crown', '{face,chest}',            'Row of figures rising, hands up'),
  ('Bouquet',            120, 'glows', 'anchor', 2400, 'hands', '{chest,shoulder_r}',      'Wildflowers, paper-wrapped'),
  ('Sunbeam',            150, 'glows', 'anchor', 2400, 'crown', '{face}',                  'Light shaft through a window'),
  ('Care Package',       175, 'glows', 'anchor', 2400, 'hands', '{chest}',                 'Open box, twine, contents showing'),
  ('Encore',             200, 'glows', 'anchor', 2600, 'shoulder_r', '{shoulder_l,chest}', 'Vinyl record with hand lettering'),
  ('Handwritten Letter', 225, 'glows', 'anchor', 2600, 'hands', '{chest}',                 'Folded paper, visible script'),
  ('Campfire',           250, 'glows', 'anchor', 2600, 'chest', '{hands}',                 'Small fire, three stones'),
  ('Balloon Bundle',     275, 'glows', 'anchor', 2800, 'shoulder_l', '{shoulder_r,crown}', 'Five balloons, strings tangled'),
  ('Pep Talk',           300, 'glows', 'anchor', 2800, 'shoulder_r', '{shoulder_l,face}',  'Speech bubble with a small sun'),
  ('Ice Cream Truck',    325, 'glows', 'anchor', 2800, 'chest', '{hands}',                 'Truck side, window open'),
  ('First Place Ribbon', 350, 'glows', 'anchor', 2800, 'chest', '{shoulder_l}',            'Rosette ribbon, hand-drawn'),
  ('Golden Hour',        400, 'glows', 'anchor', 3000, 'crown', '{face}',                  'Low sun, long shadows'),
  ('Lantern Release',    450, 'glows', 'anchor', 3000, 'hands', '{crown}',                 'Three paper lanterns rising'),
  ('Marching Band',      499, 'glows', 'anchor', 3000, 'shoulder_l', '{shoulder_r,chest}', 'Drum, horn, silhouette figures');

-- Stage gifts (Bursts, Showers): fill + duration from the blips band.
insert into gift_catalog (name, coins, tier, render_mode, duration_ms, box_fill_pct, icon_concept)
select v.name, v.b, v.tier, 'stage', pg_temp.stage_ms(v.b), pg_temp.stage_fill(v.b), v.concept
from (values
  ('Fireworks',         500, 'bursts',  'Single burst, three trails'),
  ('Confetti Cannon',   600, 'bursts',  'Cannon mid-fire, paper scatter'),
  ('Hot Air Balloon',   750, 'bursts',  'Striped balloon, small basket'),
  ('Backstage Pass',    900, 'bursts',  'Laminate on a lanyard'),
  ('Rainbow',          1000, 'bursts',  'Full arc, soft bands'),
  ('Parade',           1200, 'bursts',  'Float and figures in silhouette'),
  ('Sold Out Show',    1400, 'bursts',  'Marquee reading SOLD OUT'),
  ('Name in Lights',   1600, 'bursts',  'Bulb-lit marquee letters'),
  ('Ferris Wheel',     1800, 'bursts',  'Wheel with lit cars'),
  ('Northern Lights',  1999, 'bursts',  'Aurora ribbons over a ridge'),
  ('Meteor Shower',    2000, 'showers', 'Multiple streaks, one bright'),
  ('Carnival',         2500, 'showers', 'Tent, flags, lights'),
  ('Whale Song',       3000, 'showers', 'Whale silhouette, sound rings'),
  ('Moon Landing',     4000, 'showers', 'Flag and bootprint'),
  ('City Skyline',     5000, 'showers', 'Skyline, windows lighting up'),
  ('Constellation',    6000, 'showers', 'Connected stars forming a smile'),
  ('Total Eclipse',    7500, 'showers', 'Corona ring, dark disc'),
  ('Supernova',        9999, 'showers', 'Expanding light, radial burst')
) as v(name, b, tier, concept);

-- From here on every active gift must carry a tier.
alter table gift_catalog
  add constraint gift_active_has_tier check (not active or tier is not null);
