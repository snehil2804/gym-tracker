-- When an account is deleted, its attendance rows are removed by cascade. Voiding their ledger
-- entries at that point would write rows for a user that no longer exists (and the ledger is
-- being deleted anyway), so the DELETE branch now skips work if the owner is gone.

create or replace function private.attendance_sync_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_active public.pt_ledger%rowtype;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old; -- account deletion cascade: everything goes
    end if;
    update public.pt_ledger
       set voided_at = now(),
           void_reason = format('Attendance record for %s was deleted', to_char(old.date, 'DD Mon YYYY'))
     where attendance_id = old.id and voided_at is null;
    return old;
  end if;

  v_kind := case new.pt_status when 'completed' then 'completed' when 'chargeable_absence' then 'forfeited' end;

  select * into v_active from public.pt_ledger
   where attendance_id = new.id and voided_at is null
   for update;

  if found and (v_kind is null
                or v_active.kind <> v_kind
                or v_active.package_id <> new.pt_package_id
                or v_active.session_date <> new.date) then
    update public.pt_ledger
       set voided_at = now(),
           void_reason = format('Attendance on %s changed: PT %s → %s',
                                to_char(new.date, 'DD Mon YYYY'),
                                coalesce(case when tg_op = 'UPDATE' then old.pt_status end, v_active.kind),
                                new.pt_status)
     where id = v_active.id;
    v_active := null;
  end if;

  if v_kind is not null and v_active.id is null then
    insert into public.pt_ledger (user_id, package_id, kind, sessions, session_date, attendance_id, note)
    values (new.user_id, new.pt_package_id, v_kind, -1, new.date, new.id,
            case v_kind when 'completed' then 'PT session completed' else 'Confirmed chargeable PT absence' end);
    perform private.assert_non_negative(new.pt_package_id);
  end if;

  return new;
end;
$$;
revoke all on function private.attendance_sync_ledger() from public, anon, authenticated;
