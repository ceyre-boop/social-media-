-- Gift Gallery v1 + Render Spec v1 catalog (migration 008).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::int from gift_catalog where active), 60, 'the gallery has 60 active gifts');
select is((select count(*)::int from gift_catalog where tier = 'sunrise'), 2, 'exactly two Sunrise gifts');
select is((select count(*)::int from gift_catalog where render_mode = 'anchor' and anchor_preferred is null), 0,
  'every anchor gift declares a preferred anchor');
select is((select count(*)::int from gift_catalog
            where name in ('Fireworks','Rainbow','Meteor Shower','Supernova')
              and box_fill_pct = case name when 'Fireworks' then 45 when 'Rainbow' then 60
                                           when 'Meteor Shower' then 75 else 90 end), 4,
  'stage fill follows the blips band');
select throws_ok(
  $$insert into gift_catalog (name, coins, tier, render_mode) values ('Yacht', 5000, 'showers', 'rail')$$,
  '23514', null, 'render mode must match the tier');
select throws_ok(
  $$insert into gift_catalog (name, coins, tier, render_mode) values ('Tiny', 50, 'blips', 'rail')$$,
  '23514', null, 'price must sit inside the tier band');
select throws_ok(
  $$insert into gift_catalog (name, coins, tier, render_mode, anchor_preferred) values ('Odd', 150, 'glows', 'anchor', 'knee')$$,
  '23514', null, 'anchor points are the six named ones');
select throws_ok(
  $$insert into gift_catalog (name, coins, tier, render_mode) values ('wave', 1, 'blips', 'rail')$$,
  '23505', null, 'gift names are unique, case-insensitively');

set local role anon;
select is((select count(*)::int from gift_catalog where active), 60, 'anon can browse the catalog');
reset role;

select * from finish();
rollback;
