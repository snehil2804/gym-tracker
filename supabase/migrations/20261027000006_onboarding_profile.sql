-- Onboarding, personalisation and profile photos.
--   onboarded_at        NULL until the user finishes (or skips through) the welcome flow
--   pt_enabled          personal-training features are shown only when true
--   membership_enabled  gym-membership tracking is shown only when true
--   birth_date, height_cm, avatar_path   optional profile details

alter table public.profiles
  add column if not exists onboarded_at timestamptz,
  add column if not exists pt_enabled boolean not null default false,
  add column if not exists membership_enabled boolean not null default true,
  add column if not exists birth_date date check (birth_date is null or birth_date > date '1900-01-01'),
  add column if not exists height_cm numeric(5,1) check (height_cm is null or height_cm between 50 and 272),
  add column if not exists avatar_path text check (avatar_path is null or length(avatar_path) <= 300);

-- Existing accounts that already track a PT package keep everything visible and skip onboarding.
update public.profiles p
   set onboarded_at = coalesce(p.onboarded_at, now()),
       pt_enabled = true
 where exists (select 1 from public.pt_packages k where k.user_id = p.id);

-- The owner seed now also marks onboarding as done and turns PT on.
create or replace function public.initialize_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_owner   text;
  v_profile public.profiles%rowtype;
  v_trainer uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = v_uid for update;

  if v_profile.seeded_at is not null then
    return jsonb_build_object('seeded', false, 'reason', 'already_initialized');
  end if;

  perform private.ensure_defaults(v_uid);

  select lower(email) into v_email from auth.users where id = v_uid;
  select lower(btrim(value)) into v_owner from private.app_config where key = 'owner_email';

  if v_owner is null or v_email is distinct from v_owner then
    update public.profiles set seeded_at = now() where id = v_uid;
    return jsonb_build_object('seeded', false, 'reason', 'not_owner');
  end if;

  insert into public.memberships (user_id, gym_name, start_date, duration_months, price_paise,
                                  price_is_approximate, payment_status, notes)
  values (v_uid, '19Fitness', date '2026-09-29', 3, 500000, true, 'unconfirmed',
          'From initial setup: price is approximate (about ₹5,000). Confirm the contractual expiry date and whether it was paid.')
  on conflict (user_id, gym_name, start_date) do nothing;

  insert into public.trainers (user_id, name) values (v_uid, 'Soham') on conflict do nothing;
  select id into v_trainer from public.trainers where user_id = v_uid and lower(btrim(name)) = 'soham';

  if not exists (select 1 from public.pt_packages where user_id = v_uid and trainer_id = v_trainer and start_date = date '2026-09-29') then
    insert into public.pt_packages (user_id, trainer_id, label, price_paise, sessions_purchased, purchased_on,
                                    start_date, expiry_date, schedule_days, exclude_sundays, sessions_per_week, notes)
    values (v_uid, v_trainer, 'Original package', 600000, 30, null, date '2026-09-29', null,
            '{1,2,3,4,5,6}', true, 6,
            'From initial setup. Payment not yet recorded — add it under PT Packages once confirmed.');
  end if;

  insert into public.attendance (user_id, date, gym_status, pt_status, notes, source)
  select v_uid, d, 'absent',
         case when extract(isodow from d) = 7 then 'not_scheduled' else 'unverified' end,
         case when extract(isodow from d) = 7
              then 'Confirmed gym absence. Sunday — no PT session under the default Monday–Saturday schedule.'
              else 'Confirmed gym absence. Whether a PT session was scheduled and charged has not been confirmed.' end,
         'seed'
  from unnest(array['2026-10-01', '2026-10-03', '2026-10-11', '2026-10-12', '2026-10-13',
                    '2026-10-15', '2026-10-17', '2026-10-19', '2026-10-23', '2026-10-24']::date[]) as d
  on conflict (user_id, date) do nothing;

  update public.profiles
     set seeded_at = now(),
         onboarded_at = coalesce(onboarded_at, now()),
         pt_enabled = true,
         membership_enabled = true,
         tracking_start_date = coalesce(tracking_start_date, date '2026-09-29')
   where id = v_uid;

  return jsonb_build_object('seeded', true);
end;
$$;
revoke execute on function public.initialize_account() from public, anon;
grant execute on function public.initialize_account() to authenticated;

-- Private profile photos: avatars/<user_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false;

create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
