-- New PT outcome: the member cancelled the session themselves ("client_cancelled").
-- Like a trainer cancellation it does NOT consume a session by default. If the trainer still
-- charged it (e.g. late cancellation), the day is recorded as 'chargeable_absence' instead.

alter table public.attendance drop constraint attendance_pt_status_check;
alter table public.attendance add constraint attendance_pt_status_check check (
  pt_status in ('completed', 'chargeable_absence', 'missed_unconfirmed', 'trainer_cancelled',
                'client_cancelled', 'rescheduled', 'not_scheduled', 'unverified'));

-- Link client cancellations to the package (for per-package counts); no ledger entry is created.
create or replace function private.attendance_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.pt_packages%rowtype;
  v_consumes boolean := new.pt_status in ('completed', 'chargeable_absence');
  v_links_package boolean := new.pt_status in ('completed', 'chargeable_absence', 'missed_unconfirmed',
                                               'trainer_cancelled', 'client_cancelled', 'rescheduled');
begin
  if new.pt_status <> 'rescheduled' then
    new.rescheduled_to := null;
  end if;

  if not v_links_package then
    new.pt_package_id := null;
    return new;
  end if;

  if new.pt_package_id is null
     or (tg_op = 'UPDATE' and new.date is distinct from old.date and new.pt_package_id = old.pt_package_id) then
    new.pt_package_id := private.resolve_package(new.user_id, new.date, v_consumes);
  end if;

  if new.pt_package_id is null then
    if v_consumes then
      raise exception 'No active PT package covers %. Add or renew a package before recording a PT session on this date.', to_char(new.date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'no_package';
    end if;
    return new;
  end if;

  select * into v_pkg from public.pt_packages where id = new.pt_package_id and user_id = new.user_id;
  if not found then
    raise exception 'PT package not found.' using errcode = 'P0001', hint = 'no_package';
  end if;

  if v_consumes then
    if v_pkg.status = 'cancelled' then
      raise exception 'This package was cancelled; sessions cannot be recorded against it.' using errcode = 'P0001', hint = 'package_cancelled';
    end if;
    if new.date < v_pkg.start_date then
      raise exception 'The package starts on %. Sessions cannot be deducted before a package becomes active.', to_char(v_pkg.start_date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'package_not_started';
    end if;
    if v_pkg.expiry_date is not null and new.date > v_pkg.expiry_date and not v_pkg.extension_allowed then
      raise exception 'The package expired on %. Allow an expiry extension on the package to record this session.', to_char(v_pkg.expiry_date, 'DD Mon YYYY')
        using errcode = 'P0001', hint = 'package_expired';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.attendance_before() from public, anon, authenticated;

-- package_summary gains a client_cancelled count (appended column, everything else unchanged).
create or replace view public.package_summary
with (security_invoker = true) as
select
  p.id, p.user_id, p.trainer_id, t.name as trainer_name, p.label, p.price_paise, p.sessions_purchased,
  p.purchased_on, p.start_date, p.expiry_date, p.schedule_days, p.exclude_sundays, p.sessions_per_week,
  p.rollover_allowed, p.pausable, p.extension_allowed, p.status, p.closed_on, p.unused_sessions_treatment,
  p.renewed_from_id, p.notes, p.created_at,
  coalesce(l.completed, 0)::int             as completed,
  coalesce(l.forfeited, 0)::int             as forfeited,
  coalesce(l.credited, 0)::int              as credited,
  coalesce(l.refunded, 0)::int              as refunded,
  coalesce(l.expired, 0)::int               as expired,
  coalesce(l.transferred_in, 0)::int        as transferred_in,
  coalesce(l.transferred_out, 0)::int       as transferred_out,
  coalesce(l.adjusted, 0)::int              as adjusted,
  (p.sessions_purchased + coalesce(l.net, 0))::int as remaining,
  l.last_session_date,
  coalesce(a.trainer_cancelled, 0)::int     as trainer_cancelled,
  coalesce(a.rescheduled, 0)::int           as rescheduled,
  coalesce(a.missed_unconfirmed, 0)::int    as missed_unconfirmed,
  coalesce(pay.paid, 0)::bigint             as paid_paise,
  coalesce(pay.refunded, 0)::bigint         as refunded_paise,
  coalesce(pay.pending, 0)::bigint          as pending_paise,
  greatest(p.price_paise - coalesce(pay.paid, 0), 0)::bigint as outstanding_paise,
  coalesce(a.client_cancelled, 0)::int      as client_cancelled
from public.pt_packages p
join public.trainers t on t.id = p.trainer_id
left join lateral (
  select
    count(*) filter (where kind = 'completed')                       as completed,
    count(*) filter (where kind = 'forfeited')                       as forfeited,
    sum(sessions) filter (where kind = 'credit')                     as credited,
    -sum(sessions) filter (where kind = 'refund')                    as refunded,
    -sum(sessions) filter (where kind = 'expired')                   as expired,
    sum(sessions) filter (where kind = 'transfer_in')                as transferred_in,
    -sum(sessions) filter (where kind = 'transfer_out')              as transferred_out,
    sum(sessions) filter (where kind = 'adjustment')                 as adjusted,
    sum(sessions)                                                    as net,
    max(session_date) filter (where kind in ('completed', 'forfeited')) as last_session_date
  from public.pt_ledger
  where package_id = p.id and voided_at is null
) l on true
left join lateral (
  select
    count(*) filter (where pt_status = 'trainer_cancelled')  as trainer_cancelled,
    count(*) filter (where pt_status = 'client_cancelled')   as client_cancelled,
    count(*) filter (where pt_status = 'rescheduled')        as rescheduled,
    count(*) filter (where pt_status = 'missed_unconfirmed') as missed_unconfirmed
  from public.attendance
  where pt_package_id = p.id
) a on true
left join lateral (
  select
    sum(amount_paise) filter (where kind = 'payment' and status = 'paid')    as paid,
    sum(amount_paise) filter (where kind = 'refund' and status = 'paid')     as refunded,
    sum(amount_paise) filter (where kind = 'payment' and status = 'pending') as pending
  from public.pt_payments
  where package_id = p.id
) pay on true;

grant select on public.package_summary to authenticated;
revoke all on public.package_summary from anon;
