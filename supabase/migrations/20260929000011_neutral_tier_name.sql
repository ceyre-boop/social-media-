-- ============================================================================
-- 011 — Neutral name for the entry gift tier.
--
-- The first tier was stored as 'blips', which is the placeholder currency name.
-- The currency name is changing (see src/config/brand.ts), and no identifier or
-- stored enum value may carry it. The tier is now 'entry', matching the app's
-- catalog (src/components/gifts/catalog.ts). Prices are unchanged.
-- ============================================================================

alter table gift_catalog
  drop constraint gift_tier_check,
  drop constraint gift_tier_mode_check,
  drop constraint gift_tier_price_check;

update gift_catalog set tier = 'entry' where tier = 'blips';

alter table gift_catalog
  add constraint gift_tier_check
    check (tier in ('entry','sparks','glows','bursts','showers','sunrise')),
  add constraint gift_tier_mode_check check (
    (tier in ('entry','sparks') and render_mode = 'rail')
    or (tier = 'glows'   and render_mode = 'anchor')
    or (tier in ('bursts','showers') and render_mode = 'stage')
    or (tier = 'sunrise' and render_mode = 'takeover')),
  add constraint gift_tier_price_check check (
    (tier = 'entry'   and coins between 1 and 9)
    or (tier = 'sparks'  and coins between 10 and 99)
    or (tier = 'glows'   and coins between 100 and 499)
    or (tier = 'bursts'  and coins between 500 and 1999)
    or (tier = 'showers' and coins between 2000 and 9999)
    or (tier = 'sunrise' and coins = 10000));
