-- ============================================================================
-- 009 — Gift Gallery v2: the catalog follows the first 60 illustrated icons
-- (assets/gifts/*.png). Colin's call (2026-09-29): gifts are renamed to the
-- icons; crown, trophy, champagne, airplane and sailboat were drawn but break
-- gallery rule #1 (no luxury goods, vehicles or wealth signifiers), so those
-- five slots are gesture gifts with placeholder tiles until new art exists.
--
-- Tier sizes and price bands are unchanged from v1 (12/14/14/10/8/2).
-- icon_url holds the bundled asset key 'gifts/<slug>.png'; '' = placeholder.
-- Catalog only: nothing here sells, spends, or writes the ledger.
-- ============================================================================

-- Retire v1 rows. Keep any that were ever sent (gift_events is append-only).
update gift_catalog set active = false;
delete from gift_catalog g
 where not exists (select 1 from gift_events e where e.gift_id = g.id);

drop index if exists gift_catalog_name_key;
create unique index gift_catalog_active_name_key on gift_catalog (lower(name)) where active;

alter table gift_catalog add column slug text;
create unique index gift_catalog_active_slug_key on gift_catalog (slug) where active;

-- 008 created these session-temp helpers; migrations share one session.
drop function if exists pg_temp.stage_fill(integer);
drop function if exists pg_temp.stage_ms(integer);
create function pg_temp.stage_fill(b integer) returns smallint language sql immutable as $$
  select (case when b < 1000 then 45 when b < 2000 then 60 when b < 5000 then 75 else 90 end)::smallint $$;
create function pg_temp.stage_ms(b integer) returns integer language sql immutable as $$
  select case when b < 1000 then 3000 when b < 2000 then 3200 when b < 5000 then 3600 else 4000 end $$;
create function pg_temp.icon(slug text, art boolean) returns text language sql immutable as $$
  select case when art then 'gifts/' || slug || '.png' else '' end $$;

-- Rail: Blips (1–9) and Sparks (10–99).
insert into gift_catalog (slug, name, coins, tier, render_mode, duration_ms, icon_url, icon_concept)
select v.slug, v.name, v.b, v.tier, 'rail', v.ms, pg_temp.icon(v.slug, true), v.concept
from (values
  ('smile',            'Smile',             1, 'blips',  1200, 'Yellow smiley face'),
  ('heart',            'Heart',             1, 'blips',  1200, 'Warm red heart'),
  ('sparkle',          'Sparkle',           2, 'blips',  1200, 'Scatter of gold stars'),
  ('daisy',            'Daisy',             2, 'blips',  1200, 'White daisy, yellow center'),
  ('tulip',            'Tulip',             3, 'blips',  1200, 'Single pink tulip'),
  ('cherries',         'Cherries',          3, 'blips',  1200, 'Pair of cherries on a stem'),
  ('strawberry',       'Strawberry',        5, 'blips',  1200, 'Ripe strawberry'),
  ('lucky-clover',     'Lucky Clover',      5, 'blips',  1200, 'Four-leaf clover'),
  ('paper-plane',      'Paper Plane',       7, 'blips',  1200, 'Folded paper plane'),
  ('heart-shades',     'Heart Shades',      7, 'blips',  1200, 'Heart-shaped sunglasses'),
  ('lemon-drop',       'Lemon Drop',        9, 'blips',  1200, 'Lemon with a leaf'),
  ('popcorn',          'Popcorn',           9, 'blips',  1200, 'Striped popcorn bucket'),
  ('warm-mug',         'Warm Mug',         10, 'sparks', 1600, 'Steaming blue mug'),
  ('good-morning',     'Good Morning',     15, 'sparks', 1600, 'Bright sun with rays'),
  ('goodnight',        'Goodnight',        15, 'sparks', 1600, 'Crescent moon and stars'),
  ('just-peachy',      'Just Peachy',      20, 'sparks', 1600, 'Peach with leaves'),
  ('watermelon-slice', 'Watermelon Slice', 25, 'sparks', 1600, 'Watermelon wedge'),
  ('avocado',          'Better Together',  30, 'sparks', 1600, 'Avocado halves'),
  ('cupcake',          'Cupcake',          35, 'sparks', 1600, 'Cupcake with a cherry'),
  ('polaroid',         'Polaroid',         40, 'sparks', 1600, 'Instant photo, sunny hill'),
  ('snapshot',         'Snapshot',         45, 'sparks', 1600, 'Teal camera'),
  ('playlist-for-you', 'Playlist For You', 50, 'sparks', 1800, 'Floating music notes'),
  ('headphones',       'Good Listener',    55, 'sparks', 1800, 'Blue headphones'),
  ('player-two',       'Player Two',       60, 'sparks', 1800, 'Purple game controller'),
  ('pencil',           'Take Notes',       75, 'sparks', 2000, 'Yellow pencil'),
  ('love-letter',      'Love Letter',      99, 'sparks', 2000, 'Envelope sealed with a heart')
) as v(slug, name, b, tier, ms, concept);

-- Anchor: Glows (100–499). Long Hug is a placeholder slot (no art yet).
insert into gift_catalog (slug, name, coins, tier, render_mode, duration_ms,
                          anchor_preferred, anchor_fallbacks, icon_url, icon_concept)
select v.slug, v.name, v.b, 'glows', 'anchor', v.ms, v.anchor, v.fallbacks,
       pg_temp.icon(v.slug, v.art), v.concept
from (values
  ('youre-a-star',   'You''re a Star',  100, 2400, 'crown',      '{face,chest}'::text[],        true,  'Purple star'),
  ('little-gift',    'Little Gift',     120, 2400, 'hands',      '{chest}'::text[],             true,  'Wrapped gift with a bow'),
  ('bright-idea',    'Bright Idea',     150, 2400, 'crown',      '{face}'::text[],              true,  'Glowing light bulb'),
  ('story-time',     'Story Time',      175, 2400, 'hands',      '{chest}'::text[],             true,  'Open book'),
  ('book-stack',     'Book Stack',      200, 2600, 'hands',      '{chest,shoulder_r}'::text[],  true,  'Stack of three books'),
  ('seashell',       'Seashell',        225, 2600, 'hands',      '{chest}'::text[],             true,  'Pink scallop shell'),
  ('starfish',       'Starfish',        250, 2600, 'chest',      '{hands}'::text[],             true,  'Orange starfish'),
  ('cactus-hug',     'Cactus Hug',      275, 2800, 'chest',      '{hands}'::text[],             true,  'Friendly green cactus'),
  ('balloon-bundle', 'Balloon Bundle',  300, 2800, 'shoulder_l', '{shoulder_r,crown}'::text[],  true,  'Three balloons'),
  ('bouquet',        'Bouquet',         325, 2800, 'hands',      '{chest,shoulder_r}'::text[],  true,  'Wrapped flower bouquet'),
  ('hype-horn',      'Hype Horn',       350, 2800, 'shoulder_r', '{shoulder_l,face}'::text[],   true,  'Pink megaphone'),
  ('action',         'Action!',         400, 3000, 'shoulder_r', '{shoulder_l,chest}'::text[],  true,  'Film clapperboard'),
  ('disco-ball',     'Disco Ball',      450, 3000, 'crown',      '{face}'::text[],              true,  'Mirror ball with sparkles'),
  ('long-hug',       'Long Hug',        499, 3000, 'chest',      '{hands}'::text[],             false, 'Two figures, arms fully wrapped')
) as v(slug, name, b, ms, anchor, fallbacks, art, concept);

-- Stage: Bursts (500–1,999) and Showers (2,000–9,999).
insert into gift_catalog (slug, name, coins, tier, render_mode, duration_ms, box_fill_pct,
                          icon_url, icon_concept)
select v.slug, v.name, v.b, v.tier, 'stage', pg_temp.stage_ms(v.b), pg_temp.stage_fill(v.b),
       pg_temp.icon(v.slug, v.art), v.concept
from (values
  ('fireworks',        'Fireworks',         500, 'bursts',  true,  'Firework burst'),
  ('party-popper',     'Party Popper',      600, 'bursts',  true,  'Party popper with streamers'),
  ('rainbow',          'Rainbow',           750, 'bursts',  true,  'Rainbow between clouds'),
  ('birthday-cake',    'Birthday Cake',     900, 'bursts',  true,  'Layer cake with candles'),
  ('campfire',         'Campfire',         1000, 'bursts',  true,  'Crackling campfire'),
  ('palm-tree',        'Palm Tree',        1200, 'bursts',  true,  'Palm tree'),
  ('big-wave',         'Big Wave',         1400, 'bursts',  true,  'Curling ocean wave'),
  ('campout',          'Campout',          1600, 'bursts',  true,  'Tent'),
  ('forest-walk',      'Forest Walk',      1800, 'bursts',  true,  'Pine trees'),
  ('standing-ovation', 'Standing Ovation', 1999, 'bursts',  false, 'Row of figures rising, hands up'),
  ('mountain-top',     'Mountain Top',     2000, 'showers', true,  'Snowy mountains'),
  ('treasure-map',     'Treasure Map',     2500, 'showers', true,  'Folded map with a pin'),
  ('true-north',       'True North',       3000, 'showers', true,  'Compass'),
  ('island-day',       'Island Day',       4000, 'showers', true,  'Island with palms and sun'),
  ('main-stage',       'Main Stage',       5000, 'showers', true,  'Stage with a disco ball'),
  ('whole-world',      'Whole World',      6000, 'showers', true,  'Globe'),
  ('northern-lights',  'Northern Lights',  7500, 'showers', false, 'Aurora ribbons over a ridge'),
  ('constellation',    'Constellation',    9999, 'showers', false, 'Connected stars forming a smile')
) as v(slug, name, b, tier, art, concept);

-- Takeover: Sunrise (10,000).
insert into gift_catalog (slug, name, coins, tier, render_mode, duration_ms, icon_url, icon_concept) values
  ('sunrise',       'Sunrise',       10000, 'sunrise', 'takeover', 6000, 'gifts/sunrise.png', 'Sun rising over the sea'),
  ('the-whole-sky', 'The Whole Sky', 10000, 'sunrise', 'takeover', 6000, '',                  'Sky in every color, ground silhouette');

alter table gift_catalog
  add constraint gift_active_has_slug check (not active or slug is not null);
