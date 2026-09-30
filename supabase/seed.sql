-- ============================================================================
-- LOCAL DEV SEED — applied by `supabase db reset` after migrations.
--
-- Test users (password for all: password123):
--   alice  11111111-…  adult, age-verified   (the author in the visibility matrix)
--   bob    22222222-…  adult, age-verified   (mutual 'regular' with alice)
--   minnie 33333333-…  15, minor
--   carol  44444444-…  adult, NOT age-verified ('returning' to alice)
--   dave   55555555-…  adult, age-verified   (no relationship with anyone)
--
-- Seed users skip onboarding, so their profiles are inserted here; real users
-- create their profile in the app on first login.
-- ============================================================================

-- COIN PRODUCTS (Infrastructure Cost Model: bundles start at $4.99 because of
-- Stripe's $0.30 fixed fee).
insert into public.coin_products (sku, coins, price_cents, currency) values
  ('coins_500',   500,  499, 'USD'),
  ('coins_1000', 1000,  999, 'USD'),
  ('coins_2500', 2500, 2499, 'USD'),
  ('coins_5000', 5000, 4999, 'USD');

-- GIFT CATALOG: the 60-gift gallery is reference data in migration 008.

-- TEST USERS (auth.users + auth.identities so email/password login works).
-- on_auth_user_created creates the public.users row (with DOB) only.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
       extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('date_of_birth', v.dob::text),
       now(), now(), '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'alice@example.com',  date '1995-04-12'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'bob@example.com',    date '1990-09-01'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'minnie@example.com', (current_date - interval '15 years')::date),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'carol@example.com',  date '1988-02-20'),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'dave@example.com',   date '1992-11-30')
) as v(id, email, dob);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.email in ('alice@example.com', 'bob@example.com', 'minnie@example.com',
                  'carol@example.com', 'dave@example.com');

-- Age verification (provider boolean + reference only; no documents).
-- carol is an adult but deliberately unverified; minnie is a minor.
update public.users
set age_verified = true, age_verified_at = now(),
    age_verification_ref = 'dev-seed-' || split_part(email::text, '@', 1)
where id in ('11111111-1111-4111-8111-111111111111',
             '22222222-2222-4222-8222-222222222222',
             '55555555-5555-4555-8555-555555555555');

-- PROFILES
insert into public.profiles (user_id, username, display_name, bio) values
  ('11111111-1111-4111-8111-111111111111', 'alice',  'Alice',  'Makes things.'),
  ('22222222-2222-4222-8222-222222222222', 'bob',    'Bob',    'Shows up.'),
  ('33333333-3333-4333-8333-333333333333', 'minnie', 'Minnie', null),
  ('44444444-4444-4444-8444-444444444444', 'carol',  'Carol',  null),
  ('55555555-5555-4555-8555-555555555555', 'dave',   'Dave',   null);

-- POSTS — alice covers every visibility, plus two others.
insert into public.posts (id, author_id, kind, caption, visibility, created_at, deleted_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'post', 'Hello world — first post!',            'public',    now() - interval '30 days', null),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'post', 'For the people who keep coming back.', 'followers', now() - interval '3 days',  null),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'post', 'Friends only.',                        'friends',   now() - interval '2 days',  null),
  ('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'post', 'Note to self.',                        'private',   now() - interval '1 day',   null),
  ('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'post', 'Sunset from the roof.',                'public',    now() - interval '12 hours', null),
  ('aaaaaaaa-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111',
   'post', 'Deleted draft.',                       'public',    now() - interval '6 hours',  now() - interval '5 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'post', 'Bob says hi.',                         'public',    now() - interval '25 days', null);

-- ALICE'S FIRST POST + its new-account reach ramp (disclosed in plain language).
insert into public.reach_events (post_id, reason, multiplier, explanation)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'new_account', 0.800,
        'Your account is new, so this post is shown to a slightly smaller audience '
        '(80% of normal) while we confirm you are a real person. This ends automatically '
        '14 days after you joined and applies only once.');

-- INTERACTIONS (as the app/triggers would have written them) and the
-- RELATIONSHIPS the recompute job would derive from them:
--   bob   → alice 'regular'   (4 distinct weeks)
--   alice → bob   'regular'   (4 distinct weeks)   ⇒ bob ↔ alice mutual
--   carol → alice 'returning' (came back once)
--   dave: none
insert into public.interactions (actor_id, subject_id, post_id, kind, occurred_at) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'view',     now() - interval '28 days'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'complete', now() - interval '21 days'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   null,                                   'profile_visit', now() - interval '14 days'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000002', 'view',     now() - interval '3 days'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-0000-4000-8000-000000000001', 'view',     now() - interval '25 days'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-0000-4000-8000-000000000001', 'comment',  now() - interval '18 days'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   null,                                   'profile_visit', now() - interval '10 days'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-0000-4000-8000-000000000001', 'view',     now() - interval '2 days'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001', 'view',     now() - interval '9 days'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000005', 'view',     now() - interval '10 hours');

insert into public.relationships (actor_id, subject_id, state, distinct_weeks,
                                  interaction_count, first_seen_at, last_seen_at) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'regular',   4, 4, now() - interval '28 days', now() - interval '3 days'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
   'regular',   4, 4, now() - interval '25 days', now() - interval '2 days'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   'returning', 2, 2, now() - interval '9 days',  now() - interval '10 hours');
