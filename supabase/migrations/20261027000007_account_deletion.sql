-- Self-service account deletion ("total wipe-out").
--
-- 1. The app removes the user's files from Storage first (Supabase forbids deleting
--    storage.objects rows from SQL; the Storage API also removes the actual files).
-- 2. public.delete_my_account('DELETE') checks no files remain, records a minimal entry in
--    private.deleted_accounts, then deletes the auth user. Every user-owned table has
--    ON DELETE CASCADE to auth.users, so all records (attendance, ledger, packages, payments,
--    workouts, measurements, goals, photo metadata, audit log, profile…) go with it.
--
-- private.deleted_accounts is not exposed through the API; only the database owner can read it.

create table if not exists private.deleted_accounts (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null,
  email              text,
  providers          text[],
  account_created_at timestamptz,
  last_sign_in_at    timestamptz,
  deleted_at         timestamptz not null default now(),
  data_summary       jsonb not null default '{}'::jsonb
);
comment on table private.deleted_accounts is
  'One row per self-deleted account: who and when, plus counts of what was removed. No personal records are kept.';
create index if not exists deleted_accounts_email_idx on private.deleted_accounts (lower(email));
revoke all on private.deleted_accounts from public, anon, authenticated;

create or replace function public.delete_my_account(p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users%rowtype;
  v_files   int;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'P0001', hint = 'confirm_required';
  end if;

  select * into v_user from auth.users where id = v_uid;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;

  select count(*) into v_files
  from storage.objects
  where bucket_id in ('avatars', 'progress-photos')
    and (storage.foldername(name))[1] = v_uid::text;
  if v_files > 0 then
    raise exception 'Your photos must be removed first (% left). Try again.', v_files
      using errcode = 'P0001', hint = 'files_remaining';
  end if;

  v_summary := jsonb_build_object(
    'memberships',       (select count(*) from public.memberships where user_id = v_uid),
    'pt_packages',       (select count(*) from public.pt_packages where user_id = v_uid),
    'pt_payments',       (select count(*) from public.pt_payments where user_id = v_uid),
    'attendance',        (select count(*) from public.attendance where user_id = v_uid),
    'pt_ledger',         (select count(*) from public.pt_ledger where user_id = v_uid),
    'workouts',          (select count(*) from public.workouts where user_id = v_uid),
    'body_measurements', (select count(*) from public.body_measurements where user_id = v_uid),
    'goals',             (select count(*) from public.goals where user_id = v_uid),
    'progress_photos',   (select count(*) from public.progress_photos where user_id = v_uid),
    'audit_log',         (select count(*) from public.audit_log where user_id = v_uid));

  insert into private.deleted_accounts (user_id, email, providers, account_created_at, last_sign_in_at, data_summary)
  values (
    v_uid,
    v_user.email,
    coalesce(array(select jsonb_array_elements_text(v_user.raw_app_meta_data -> 'providers')), '{}'),
    v_user.created_at,
    v_user.last_sign_in_at,
    v_summary);

  -- Cascades to every user-owned table (and auth sessions / identities).
  delete from auth.users where id = v_uid;

  return jsonb_build_object('deleted', true, 'removed', v_summary);
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
