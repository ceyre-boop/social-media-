-- ============================================================================
-- LOCAL DEV SEED — applied by `supabase db reset` after migrations.
-- Test users: alice / bob (adults, age-verified), minnie (15, minor).
-- Password for all: password123
-- ============================================================================

-- DEFAULT CREATOR TERMS (platform-wide, user_id null, version 1)
insert into public.creator_terms (user_id, version, creator_share_bps, min_payout_cents,
                                  payout_delay_days, effective_from, summary)
values (
  null, 1, 7000, 2000, 7, now(),
  'You keep 70% of what remains after Apple or Google takes their 30% app store '
  'fee, which we do not control and cannot waive. Every gift you receive shows '
  'all three numbers: what the sender paid, what the app store took, and what '
  'reached you. Payouts run weekly once your balance clears $20. These terms '
  'cannot be changed retroactively — a rate change creates a new version with a '
  'future effective date, and everything earned before then settles at the old rate.'
);

-- COIN PRODUCTS (Infrastructure Cost Model: bundles start at $4.99 because of
-- Stripe's $0.30 fixed fee). 1 coin = 1 cent gross (coin_value_cents()).
insert into public.coin_products (sku, coins, price_cents, currency) values
  ('coins_500',   500,  499, 'USD'),
  ('coins_1000', 1000,  999, 'USD'),
  ('coins_2500', 2500, 2499, 'USD'),
  ('coins_5000', 5000, 4999, 'USD');

-- GIFT CATALOG
insert into public.gift_catalog (name, coins) values
  ('Rose',        10),
  ('Coffee',      50),
  ('Star',       100),
  ('Rocket',     500),
  ('Crown',     1000);

-- TEST USERS (auth.users + auth.identities so email/password login works).
-- The on_auth_user_created trigger creates public.users + public.profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'alice@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"alice","display_name":"Alice","date_of_birth":"1995-04-12"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'bob@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"username":"bob","display_name":"Bob","date_of_birth":"1990-09-01"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'minnie@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   jsonb_build_object('username', 'minnie', 'display_name', 'Minnie',
                      'date_of_birth', (current_date - interval '15 years')::date::text),
   now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.id in ('11111111-1111-4111-8111-111111111111',
               '22222222-2222-4222-8222-222222222222',
               '33333333-3333-4333-8333-333333333333');

-- Age verification (provider boolean + reference only; no documents).
update public.users
set age_verified = true, age_verified_at = now(), age_verification_ref = 'dev-seed-' || split_part(email::text, '@', 1)
where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- ALICE'S FIRST POST + its new-account reach ramp (disclosed, with duration).
insert into public.posts (id, author_id, kind, caption, visibility)
values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'post', 'Hello world — first post!', 'public');

insert into public.reach_events (post_id, reason, multiplier, explanation, expires_at)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'new_account', 0.800,
        'Your account is new, so this post is shown to a slightly smaller audience '
        '(80% of normal) while we confirm you are a real person. This ends automatically '
        '14 days after you joined and applies only once.',
        now() + interval '14 days');
