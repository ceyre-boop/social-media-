begin;
select plan(4);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'kid12@example.com', jsonb_build_object('date_of_birth', (current_date - interval '12 years')::date::text))$$,
  'P0001', 'under_minimum_age',
  'a 12-year-old cannot sign up'
);

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'future@example.com', jsonb_build_object('date_of_birth', (current_date + 1)::text))$$,
  '22007', null,
  'a future date of birth is rejected'
);

select lives_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'teen13@example.com', jsonb_build_object('date_of_birth', (current_date - interval '13 years')::date::text))$$,
  'exactly 13 today can sign up'
);

select is(
  (select date_of_birth from public.users u join auth.users a on a.id = u.id where a.email = 'teen13@example.com'),
  (current_date - interval '13 years')::date,
  'the 13-year-old''s users row has the DOB'
);

select * from finish();
rollback;
