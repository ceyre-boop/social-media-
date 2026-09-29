-- ============================================================================
-- 004 — Minimum age at signup (brief §6.8: age rules are database constraints).
--
-- COPPA: no accounts for children under 13. The app checks this too, but the
-- client is bypassable (the auth API can be hit directly), so the signup trigger
-- is the real gate. A future-dated DOB is also rejected.
--
-- Errors are stable tokens the app maps to copy:
--   invalid_date_of_birth  — malformed or in the future
--   under_minimum_age      — younger than 13
-- ============================================================================

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dob_text text := nullif(btrim(coalesce(new.raw_user_meta_data->>'date_of_birth', '')), '');
  dob date;
begin
  if dob_text is not null then
    begin
      dob := dob_text::date;
    exception when others then
      raise exception 'invalid_date_of_birth: %', dob_text using errcode = '22007';
    end;
    if dob > current_date then
      raise exception 'invalid_date_of_birth: %', dob_text using errcode = '22007';
    end if;
    if dob > (current_date - interval '13 years')::date then
      raise exception 'under_minimum_age' using errcode = 'P0001';
    end if;
  end if;
  insert into public.users (id, email, phone, date_of_birth)
  values (new.id, new.email, new.phone, dob);
  return new;
end $$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
